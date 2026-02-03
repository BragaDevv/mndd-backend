import { Router, Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

const router = Router();

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

  for (const chunk of chunks) {
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    const status = resp.status;
    const payload = await resp.json().catch(async () => ({
      error: "non-json-response",
      status,
      raw: (await resp.text()).slice(0, 500),
    }));

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

/**
 * POST /send
 * - Se não passar tokens/to → envia para TODOS os devices logados (push_devices)
 */
router.post("/send", async (req: Request, res: Response) => {
  const { title, body, image, to, tokens } = req.body || {};

  if (!title || !body) {
    return res.status(400).json({
      error: "Campos 'title' e 'body' são obrigatórios.",
    });
  }

  try {
    let expoTokens: string[] = [];

    // 1) tokens explícitos
    if (Array.isArray(tokens)) {
      expoTokens = tokens.filter(isValidExpoToken);
    }
    // 2) token único
    else if (typeof to === "string" && isValidExpoToken(to)) {
      expoTokens = [to];
    }
    // 3) fallback → todos os logados
    else {
      const snap = await admin
        .firestore()
        .collection("push_devices")
        .where("isLoggedIn", "==", true)
        .get();

      expoTokens = snap.docs
        .map((d) => d.data()?.expoToken)
        .filter(isValidExpoToken);

      expoTokens = Array.from(new Set(expoTokens));
    }

    if (expoTokens.length === 0) {
      return res.json({ success: true, sent: 0 });
    }

    const messages = expoTokens.map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      ...(image ? { image } : {}),
    }));

    const result = await sendExpoInChunks(messages);

    return res.json({
      success: true,
      sent: expoTokens.length,
      chunks: result.length,
    });
  } catch (err) {
    console.error("❌ /send error:", err);
    return res.status(500).json({ error: "Erro ao enviar notificação." });
  }
});

export default router;
