// api/cultosAviso.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

export default async function cultosAvisoHandler(_req: Request, res: Response) {
  console.log("🔔 Verificando cultos para avisar...");

  const agora = new Date();
  agora.setHours(agora.getHours() - 3); // Ajuste UTC-3
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
      const dataStr = culto.data?.trim(); // Ex: "2025-06-25"
      const horaStr = culto.horario?.trim(); // Ex: "20:00"

      if (!dataStr || !horaStr) {
        console.log("⚠️ Culto ignorado: dados incompletos.");
        continue;
      }

      const dataCompleta = new Date(`${dataStr}T${horaStr}:00-03:00`);
      if (isNaN(dataCompleta.getTime())) {
        console.log("🚨 Data inválida:", `${dataStr}T${horaStr}:00-03:00`);
        continue;
      }

      const diff = (dataCompleta.getTime() - agora.getTime()) / 60000;

      console.log(`📆 Culto: ${culto.tipo || "Sem tipo"} às ${horaStr} em ${dataStr}`);
      console.log(`📅 Data completa interpretada: ${dataCompleta.toLocaleString("pt-BR")}`);
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
          body: `${culto.tipo || "Culto"} 📍 ${culto.local || "na igreja"} às ${horaStr}`,
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
        console.log("❌ Culto fora do intervalo de envio.");
      }
    }

    res.status(200).json({ message: "Verificação de cultos concluída." });
  } catch (err) {
    console.error("❌ Erro ao processar cultos:", err);
    res.status(500).json({ error: "Erro interno ao verificar cultos." });
  }
}
