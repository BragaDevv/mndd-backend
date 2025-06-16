// api/cultosAviso.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

function parseDataHora(data: string, horario: string): Date | null {
  const dataParts = data?.split("/").map(Number);
  const horaParts = horario?.split(":").map(Number);

  if (
    !dataParts ||
    dataParts.length !== 3 ||
    !horaParts ||
    horaParts.length !== 2 ||
    dataParts.some(isNaN) ||
    horaParts.some(isNaN)
  ) {
    return null;
  }

  const [dia, mes, ano] = dataParts;
  const [hora, minuto] = horaParts;
  return new Date(ano, mes - 1, dia, hora, minuto);
}

export default async function cultosAvisoHandler(_req: Request, res: Response) {
  console.log("🔔 Verificando cultos para avisar...");

  const agora = new Date(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
  console.log("🕓 Agora (ajustada):", agora.toLocaleString("pt-BR"));

  try {
    const snapshot = await admin.firestore().collection("cultos").get();
    const cultos = snapshot.docs.map((doc) => doc.data());

    const cultosValidos = cultos.filter((culto) => {
      console.log("📦 Dados brutos do culto:", culto);

      if (!culto.data || !culto.horario) {
        console.log(`⚠️ Culto ignorado: campos 'data' ou 'horario' ausentes.`);
        return false;
      }

      const cultoDate = parseDataHora(culto.data.trim(), culto.horario.trim());
      if (!cultoDate || isNaN(cultoDate.getTime())) {
        console.log(`❌ Erro ao interpretar data/horario do culto "${culto.tipo}".`);
        return false;
      }

      const diffMinutos = (cultoDate.getTime() - agora.getTime()) / 60000;

      console.log(
        `📆 Culto: ${culto.tipo} às ${culto.horario} em ${culto.data}`
      );
      console.log(
        `📅 Interpretação: ${cultoDate.toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })} | Diferença: ${diffMinutos.toFixed(2)} minutos`
      );

      if (diffMinutos >= 115 && diffMinutos <= 125) {
        console.log("✅ Dentro do intervalo de envio!");
        return true;
      } else {
        console.log("❌ Fora do intervalo.");
        return false;
      }
    });

    if (cultosValidos.length === 0) {
      console.log("⏰ Nenhum culto começa em 2 horas.");
      return res.status(200).json({ message: "Nenhum culto dentro do intervalo." });
    }

    const tokensSnap = await admin.firestore().collection("usuarios").get();
    const tokens = tokensSnap.docs
      .map((doc) => doc.data().expoToken)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

    if (tokens.length === 0) {
      console.log("⚠️ Nenhum token válido encontrado.");
      return res.status(200).json({ message: "Sem tokens válidos." });
    }

    for (const culto of cultosValidos) {
      const messages = tokens.map((token) => ({
        to: token,
        sound: "default",
        title: "⛪ Culto em breve!",
        body: `⛪${culto.tipo || "Culto"} hoje, 📍 ${culto.local || "igreja"}`,
      }));

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
      console.log("📨 Notificações enviadas: ", expoResult);
    }

    return res.status(200).json({ message: "Notificações enviadas para cultos em 2h." });
  } catch (error) {
    console.error("❌ Erro ao verificar cultos:", error);
    return res.status(500).json({ error: "Erro interno." });
  }
}
