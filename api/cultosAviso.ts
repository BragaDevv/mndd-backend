import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

function parseDataHora(dataStr: string, horaStr: string): Date {
    const [dia, mes, ano] = dataStr.split("/").map(Number);
    const [hora, minuto] = horaStr.split(":").map(Number);
    return new Date(`${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T${horaStr}:00`);
}

export default async function cultosAvisoHandler(req: Request, res: Response) {
    try {
        const agora = new Date(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
        console.log("🔔 [AVISO CULTO] Iniciando verificação...");
        console.log("🕒 Agora:", agora.toLocaleString());

        const cultosSnap = await admin.firestore().collection("cultos").get();

        const cultosProximos = cultosSnap.docs
            .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
            .filter((culto) => {
                if (!culto.data || !culto.horario) return false;

                const cultoDate = parseDataHora(culto.data, culto.horario);
                const diffMinutos = (cultoDate.getTime() - agora.getTime()) / 60000;

                console.log(`📆 Culto: ${culto.tipo || "Sem título"} às ${culto.horario} em ${culto.data}`);
                console.log(`📅 Interpretação: ${cultoDate.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} | Diferença: ${diffMinutos.toFixed(2)} minutos`);


                // Testa se está entre 115 e 125 minutos (2h ± 5min)
                const dentroDoIntervalo = diffMinutos >= 115 && diffMinutos <= 125;
                console.log(dentroDoIntervalo ? "✅ Dentro do intervalo de envio!" : "❌ Fora do intervalo.");

                return dentroDoIntervalo;
            });

        if (cultosProximos.length === 0) {
            console.log("⏰ Nenhum culto começa em 2 horas.");
            return res.status(200).json({ message: "Sem cultos em 2h." });
        }

        const tokensSnap = await admin.firestore().collection("usuarios").get();
        const tokens = tokensSnap.docs
            .map((doc) => doc.data().expoToken)
            .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

        if (tokens.length === 0) {
            console.log("⚠️ Nenhum token válido encontrado.");
            return res.status(200).json({ message: "Sem tokens válidos." });
        }

        for (const culto of cultosProximos) {
            const messages = tokens.map((token) => ({
                to: token,
                sound: "default",
                title: `⛪ Culto às ${culto.horario}`,
                body: `⛪${culto.tipo || "Culto"} hoje, 📍 ${culto.local || "igreja"}`,
            }));

            console.log(`📨 Enviando aviso do culto: ${culto.tipo} às ${culto.horario}`);

            const response = await fetch("https://exp.host/--/api/v2/push/send", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(messages),
            });

            const expoResult = await response.json();
            console.log("📬 Resultado do envio:", expoResult);
        }

        return res.status(200).json({ message: "Notificações enviadas para cultos em 2h." });

    } catch (error) {
        console.error("❌ Erro ao enviar aviso de cultos:", error);
        return res.status(500).json({ error: "Erro ao processar notificação de culto." });
    }
}
