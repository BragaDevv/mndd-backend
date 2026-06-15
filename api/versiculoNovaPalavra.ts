import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

function isValidExpoToken(t: any): t is string {
  return (
    typeof t === "string" &&
    (t.startsWith("ExpoPushToken[") || t.startsWith("ExponentPushToken["))
  );
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendExpoInChunks(messages: any[]) {
  const chunks = chunkArray(messages, 100);
  const results: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    console.log(
      `[VERSICULO-NOVA] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
    );

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    const status = response.status;
    const payload = await response.json().catch(async () => ({
      error: "non-json-response",
      status,
      raw: (await response.text()).slice(0, 500),
    }));

    if (status < 200 || status >= 300) {
      console.error("[VERSICULO-NOVA] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

/** Anúncio diário: avisa que a nova palavra do "Adivinhe o Versículo" está disponível. */
export default async function versiculoNovaPalavraHandler(
  req: Request,
  res: Response
) {
  try {
    // modo teste: envia apenas para este uid
    const onlyUid = req.body?.onlyUid ? String(req.body.onlyUid) : null;
    console.log(
      "📖 Disparando push de NOVA PALAVRA (Adivinhe o Versículo)...",
      onlyUid ? `(teste onlyUid=${onlyUid})` : ""
    );

    const devicesSnap = await admin
      .firestore()
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    const deviceDocs = onlyUid
      ? devicesSnap.docs.filter((d) => d.data()?.uid === onlyUid)
      : devicesSnap.docs;

    const tokens = deviceDocs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    const uniqueTokens = Array.from(new Set(tokens));

    console.log("[VERSICULO-NOVA] devices logados encontrados:", devicesSnap.size);
    console.log(`📲 Tokens válidos (únicos): ${uniqueTokens.length}`);

    if (uniqueTokens.length === 0) {
      console.log("⚠️ Nenhum token válido para envio (push_devices logados).");
      return res.status(200).json({ message: "Sem tokens válidos (logados)." });
    }

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "🧩 Nova palavra do dia!",
      body: "O Adivinhe a Palavra de hoje já está no ar. Será que você descobre? 🔤",
      data: { type: "guessverse_newword" },
    }));

    console.log("🚀 Enviando push de nova palavra para todos os DEVICES LOGADOS...");

    const expoResult = await sendExpoInChunks(messages);

    return res.status(200).json({
      message: "Push de nova palavra enviado para todos os devices logados.",
      sent: uniqueTokens.length,
      expoChunks: expoResult.length,
    });
  } catch (error) {
    console.error("❌ Erro ao enviar push de nova palavra:", error);
    return res.status(500).json({ error: "Erro ao enviar push de nova palavra." });
  }
}
