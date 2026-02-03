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

function safeText(v: any, max = 80) {
  const s = (v ?? "").toString().replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

async function sendExpoInChunks(messages: any[], requestId: string) {
  const chunks = chunkArray(messages, 100);
  const results: any[] = [];

  console.log(`[SEND:${requestId}] 📦 Total messages=${messages.length} chunks=${chunks.length}`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkNo = i + 1;

    console.log(`[SEND:${requestId}] 🚀 Enviando chunk ${chunkNo}/${chunks.length} (${chunk.length} msgs)`);

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

    let payload: any = null;
    try {
      payload = await resp.json();
    } catch {
      const raw = await resp.text();
      payload = { error: "non-json-response", status, raw: raw?.slice(0, 500) };
    }

    // log resumido (sem despejar tudo)
    const ok = status >= 200 && status < 300;
    console.log(
      `[SEND:${requestId}] 📬 Chunk ${chunkNo} status=${status} ok=${ok} ` +
        `payloadType=${Array.isArray(payload) ? "array" : typeof payload}`
    );

    if (!ok) {
      console.error(`[SEND:${requestId}] ❌ Expo erro no chunk ${chunkNo}:`, payload);
    }

    results.push({ chunk: chunkNo, status, sent: chunk.length });
  }

  return results;
}

/**
 * POST /send
 * - Se não passar tokens/to → envia para TODOS os devices logados (push_devices)
 */
router.post("/send", async (req: Request, res: Response) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = Date.now();

  const { title, body, image, to, tokens } = req.body || {};

  console.log(
    `[SEND:${requestId}] 📨 POST /send title="${safeText(title)}" body="${safeText(body)}" ` +
      `hasImage=${!!image} hasTo=${!!to} tokensArray=${Array.isArray(tokens)}`
  );

  if (!title || !body) {
    console.log(`[SEND:${requestId}] ⚠️ Falha validação: title/body ausentes`);
    return res.status(400).json({
      error: "Campos 'title' e 'body' são obrigatórios.",
      requestId,
    });
  }

  try {
    let expoTokensRaw: any[] = [];
    let expoTokensValid: string[] = [];
    let expoTokensUnique: string[] = [];
    let mode: "tokens_array" | "to_single" | "push_devices_logged" = "push_devices_logged";

    // 1) tokens explícitos
    if (Array.isArray(tokens)) {
      mode = "tokens_array";
      expoTokensRaw = tokens;
      expoTokensValid = tokens.filter(isValidExpoToken);
      expoTokensUnique = Array.from(new Set(expoTokensValid));

      console.log(
        `[SEND:${requestId}] ✅ Mode=tokens_array raw=${expoTokensRaw.length} ` +
          `valid=${expoTokensValid.length} unique=${expoTokensUnique.length}`
      );
    }
    // 2) token único
    else if (typeof to === "string") {
      mode = "to_single";
      expoTokensRaw = [to];
      expoTokensValid = isValidExpoToken(to) ? [to] : [];
      expoTokensUnique = expoTokensValid;

      console.log(
        `[SEND:${requestId}] ✅ Mode=to_single valid=${expoTokensValid.length}`
      );
    }
    // 3) fallback → todos os logados
    else {
      mode = "push_devices_logged";

      console.log(`[SEND:${requestId}] 🔎 Mode=push_devices_logged buscando push_devices (isLoggedIn=true)...`);

      const snap = await admin
        .firestore()
        .collection("push_devices")
        .where("isLoggedIn", "==", true)
        .get();

      // aqui você consegue ver quantos docs retornaram
      console.log(`[SEND:${requestId}] 📄 push_devices logados encontrados: ${snap.size}`);

      expoTokensRaw = snap.docs.map((d) => d.data()?.expoToken);
      expoTokensValid = expoTokensRaw.filter(isValidExpoToken);
      expoTokensUnique = Array.from(new Set(expoTokensValid));

      console.log(
        `[SEND:${requestId}] ✅ Tokens: raw=${expoTokensRaw.length} valid=${expoTokensValid.length} unique=${expoTokensUnique.length}`
      );
    }

    if (expoTokensUnique.length === 0) {
      console.log(`[SEND:${requestId}] ⚠️ Nenhum token válido para envio. mode=${mode}`);
      return res.json({
        success: true,
        sent: 0,
        mode,
        requestId,
        ms: Date.now() - startedAt,
      });
    }

    const messages = expoTokensUnique.map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      ...(image ? { image } : {}),
    }));

    console.log(
      `[SEND:${requestId}] 🚀 Preparando envio: uniqueTokens=${expoTokensUnique.length} messages=${messages.length}`
    );

    const result = await sendExpoInChunks(messages, requestId);

    console.log(
      `[SEND:${requestId}] ✅ Concluído: sent=${expoTokensUnique.length} chunks=${result.length} ms=${Date.now() - startedAt}`
    );

    return res.json({
      success: true,
      sent: expoTokensUnique.length,
      chunks: result.length,
      mode,
      requestId,
      ms: Date.now() - startedAt,
      chunkResults: result, // resumo por chunk (não vaza tokens)
    });
  } catch (err: any) {
    console.error(`[SEND:${requestId}] ❌ /send error:`, {
      message: err?.message,
      code: err?.code,
      details: err?.details,
      stack: err?.stack,
    });

    return res.status(500).json({
      error: "Erro ao enviar notificação.",
      requestId,
    });
  }
});

export default router;
