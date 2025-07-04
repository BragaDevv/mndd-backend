// api/cultosAviso.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

export default async function cultosAvisoHandler(_req: Request, res: Response) {
  console.log("🔔 Verificando cultos para avisar...");

  const agora = new Date();
  agora.setHours(agora.getHours() - 3); // Ajuste para UTC-3
  console.log("🕓 Agora (ajustada):", agora.toLocaleString("pt-BR"));

  try {
    const snapshot = await admin.firestore().collection("cultos").get();
    console.log(`📥 Cultos encontrados: ${snapshot.size}`);

    if (snapshot.empty) {
      console.log("📭 Nenhum culto encontrado na coleção.");
      return res.status(200).json({ message: "Nenhum culto agendado." });
    }

    const cultos = snapshot.docs.map((doc) => doc.data());

    for (const culto of cultos) {
      if (!culto.data || !culto.horario) {
        console.log("⚠️ Culto ignorado: dados incompletos.");
        continue;
      }

      // Interpretação da data
      let ano: number, mes: number, dia: number;
      if (culto.data.includes("/")) {
        // Formato DD/MM/AAAA
        [dia, mes, ano] = culto.data.trim().split("/").map(Number);
      } else if (culto.data.includes("-")) {
        // Formato ISO: AAAA-MM-DD
        [ano, mes, dia] = culto.data.trim().split("-").map(Number);
      } else {
        console.log("⚠️ Formato de data desconhecido:", culto.data);
        continue;
      }

      const [hora, minuto] = culto.horario.trim().split(":").map(Number);

      if (
        isNaN(dia) || isNaN(mes) || isNaN(ano) ||
        isNaN(hora) || isNaN(minuto)
      ) {
        console.log("⚠️ Culto ignorado: data ou horário inválido.");
        continue;
      }

      const dataCulto = new Date(ano, mes - 1, dia, hora, minuto);
      if (isNaN(dataCulto.getTime())) {
        console.log("🚨 Erro ao interpretar data. Data bruta:", `${dia}/${mes}/${ano} ${hora}:${minuto}`);
        continue;
      }

      const diff = (dataCulto.getTime() - agora.getTime()) / 60000;

      console.log(`📆 Culto: ${culto.tipo} às ${culto.horario} em ${culto.data}`);
      console.log(`🗓️ Data completa interpretada: ${dataCulto.toLocaleString("pt-BR")}`);
      console.log(`⏱️ Diferença em minutos: ${diff.toFixed(2)}`);

      if (diff >= 115 && diff <= 125) {
        console.log("✅ Culto dentro do intervalo de envio de notificação!");

        const tokensSnap = await admin.firestore().collection("usuarios").get();
        const tokens = tokensSnap.docs
          .map((doc) => doc.data().expoToken)
          .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

        if (tokens.length === 0) {
          console.log("⚠️ Nenhum token válido encontrado.");
          continue;
        }

        const messages = tokens.map((token) => ({
          to: token,
          sound: "default",
          title: "🔔 Hoje tem Culto!",
          body: `${culto.tipo || "Culto"} 📍 ${culto.local || "igreja"}`,
        }));

        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages),
        });

        const expoResult = await response.json();
        console.log("📨 Notificações enviadas:", expoResult);
      } else {
        console.log("❌ Fora do intervalo.");
      }
    }

    res.status(200).json({ message: "Verificação de cultos concluída." });
  } catch (err) {
    console.error("❌ Erro ao processar cultos:", err);
    res.status(500).json({ error: "Erro interno ao verificar cultos." });
  }
}
