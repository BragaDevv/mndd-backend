// routes/notificarOwnerUsuarioCriado.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

// ✅ Agora o owner é identificado por UID (recomendado)
const OWNER_UID = process.env.OWNER_UID;

// (Opcional) fallback antigo, caso queira manter compatibilidade
const OWNER_EXPO_TOKEN = process.env.OWNER_EXPO_TOKEN;

function isValidExpoToken(token?: string) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExpoPushToken[") || token.startsWith("ExponentPushToken["))
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

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    const status = expoResponse.status;
    const payload = await expoResponse.json().catch(async () => ({
      error: "non-json-response",
      status,
      raw: (await expoResponse.text()).slice(0, 500),
    }));

    if (status < 200 || status >= 300) {
      console.error("[OWNER] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

async function getOwnerLoggedTokens(ownerUid: string) {
  const snap = await admin
    .firestore()
    .collection("push_devices")
    .where("uid", "==", ownerUid)
    .where("isLoggedIn", "==", true)
    .get();

  const tokens = snap.docs
    .map((d) => d.data()?.expoToken)
    .filter(isValidExpoToken);

  return Array.from(new Set(tokens));
}

export default async function notificarOwnerUsuarioCriado(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { uid, nome, sobrenome } = req.body || {};
    if (!nome || !sobrenome) {
      return res.status(400).json({
        error: "Envie 'nome' e 'sobrenome' no corpo da requisição.",
      });
    }

    const nomeCompleto = `${nome} ${sobrenome}`.trim();

    // ✅ preferencial: tokens dos devices logados do owner via push_devices
    let tokensOwner: string[] = [];

    if (typeof OWNER_UID === "string" && OWNER_UID.length > 5) {
      tokensOwner = await getOwnerLoggedTokens(OWNER_UID);
    }

    // (Opcional) fallback para o token fixo antigo
    if (tokensOwner.length === 0 && isValidExpoToken(OWNER_EXPO_TOKEN)) {
      tokensOwner = [OWNER_EXPO_TOKEN as string];
    }

    if (tokensOwner.length === 0) {
      return res.status(500).json({
        error:
          "Nenhum device logado do OWNER encontrado em push_devices e nenhum OWNER_EXPO_TOKEN válido configurado.",
        hint:
          "Configure OWNER_UID no Render (uid do Firebase Auth do owner) e garanta que o owner esteja logado no app para gravar push_devices.",
      });
    }

    const messages = tokensOwner.map((token) => ({
      to: token,
      sound: "default",
      title: "Novo usuário criado",
      body: nomeCompleto,
      data: {
        event: "auth_user_created",
        uid: uid ?? null,
        nome,
        sobrenome,
        createdAt: Date.now(),
      },
      priority: "high" as const,
    }));

    const expoResult = await sendExpoInChunks(messages);

    return res.status(200).json({
      success: true,
      sent: tokensOwner.length,
      tokens: tokensOwner.length,
      via: tokensOwner.length === 1 && tokensOwner[0] === OWNER_EXPO_TOKEN ? "env_fallback_token" : "push_devices_logged",
      expoResultChunks: expoResult.length,
    });
  } catch (error) {
    console.error("❌ Erro ao enviar push:", error);
    return res.status(500).json({ error: "Erro interno ao enviar notificação." });
  }
}
