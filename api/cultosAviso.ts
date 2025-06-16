import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

function parseDataHora(dataStr: string, horaStr: string): Date {
  const [dia, mes, ano] = dataStr.split("/").map(Number);
  const [hora, minuto] = horaStr.split(":").map(Number);
  return new Date(ano, mes - 1, dia, hora, minuto);
}

export default async function cultosAvisoHandler(req: Request, res: Response) {
  try {
    console.log("🔔 Verificando cultos para avisar...");

    const agora = new Date();
    const cultosSnap = await admin.firestore().collection("cultos").get();

    const cultosProximos = cultosSnap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      .filter((culto) => {
        if (!culto.data || !culto.horario) return false;

        const cultoDate = parseDataHora(culto.data, culto.horario);
        const diffMs = cultoDate.getTime() - agora.getTime();
        const diffHoras = diffMs / (1000 * 60 * 60);

        return diffHoras > 1.9 && diffHoras <= 2.1; // margem de 12 min
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
      console.log("⚠️ Nenhum token válido para envio.");
      return res.status(200).json({ message: "Sem tokens válidos." });
    }

    for (const culto of cultosProximos) {
      const messages = tokens.map((token) => ({
        to: token,
        sound: "default",
        title: `⛪ Culto às ${culto.horario}`,
        body: `${culto.tipo || "Culto"} começa em 2h no local: ${culto.local || "igreja"}`,
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
    console.error("❌ Erro ao avisar sobre cultos:", error);
    return res.status(500).json({ error: "Erro ao enviar notificações." });
  }
}
