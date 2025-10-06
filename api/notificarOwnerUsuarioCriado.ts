// routes/notificarOwnerUsuarioCriado.ts
import { Request, Response } from "express";
import fetch from "node-fetch";

// ✅ Token agora vem APENAS das variáveis de ambiente da Render
const OWNER_EXPO_TOKEN = process.env.OWNER_EXPO_TOKEN;

function isValidExpoToken(token?: string) {
  return typeof token === "string" && token.startsWith("ExponentPushToken[");
}

export default async function notificarOwnerUsuarioCriado(
  req: Request,
  res: Response
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { uid, nome, sobrenome } = req.body || {};
    if (!nome || !sobrenome) {
      return res
        .status(400)
        .json({ error: "Envie 'nome' e 'sobrenome' no corpo da requisição." });
    }

    if (!isValidExpoToken(OWNER_EXPO_TOKEN)) {
      return res.status(500).json({
        error:
          "OWNER_EXPO_TOKEN ausente ou inválido. Configure a variável de ambiente no Render com um ExponentPushToken[...] válido.",
      });
    }

    const nomeCompleto = `${nome} ${sobrenome}`.trim();

    const message = {
      to: OWNER_EXPO_TOKEN,
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
    };

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await expoResponse.json();

    return res.status(200).json({
      success: true,
      sent: 1,
      to: OWNER_EXPO_TOKEN,
      expoResult: result,
    });
  } catch (error) {
    console.error("❌ Erro ao enviar push:", error);
    return res.status(500).json({ error: "Erro interno ao enviar notificação." });
  }
}
