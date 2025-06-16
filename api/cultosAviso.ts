// api/cultosAviso.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

export default async function cultosAvisoHandler(_req: Request, res: Response) {
  console.log("🔔 Verificando cultos para avisar...");

  const agora = new Date(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));

  try {
    const cultosSnapshot = await admin.firestore().collection("cultos").get();
    const cultos = cultosSnapshot.docs.map(doc => doc.data());

    for (const culto of cultos) {
      if (!culto.data || !culto.horario) continue;

      const [dia, mes, ano] = culto.data.trim().split("/").map(Number);
      const [hora, minuto] = culto.horario.trim().split(":").map(Number);

      const dataCulto = new Date(ano, mes - 1, dia, hora, minuto);
      const diff = (dataCulto.getTime() - agora.getTime()) / 60000;

      if (diff >= 115 && diff <= 125) {
        console.log(`✅ Enviando notificação para culto: ${culto.tipo} às ${culto.horario}`);

        const tokensSnap = await admin.firestore().collection("usuarios").get();
        const tokens = tokensSnap.docs
          .map(doc => doc.data().expoToken)
          .filter(t => typeof t === "string" && t.startsWith("ExponentPushToken["));

        const messages = tokens.map(token => ({
          to: token,
          sound: "default",
          title: "🔔 Hoje tem Culto !",
          body: `⛪${culto.tipo || "Culto"} hoje, 📍 ${culto.local || "igreja"}`,
        }));

        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages),
        });

        const result = await response.json();
        console.log("📨 Notificações enviadas:", result);
      }
    }

    res.status(200).json({ message: "Verificação de cultos concluída." });
  } catch (err) {
    console.error("❌ Erro ao processar cultos:", err);
    res.status(500).json({ error: "Erro interno ao verificar cultos." });
  }
}
