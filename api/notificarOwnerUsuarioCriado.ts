import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "bragadevv@gmail.com";

// pega o token do owner em 'usuarios' filtrando por email
async function getOwnerExpoToken(): Promise<string | null> {
  try {
    const db = admin.firestore();
    const snap = await db
      .collection("usuarios")
      .where("email", "==", OWNER_EMAIL)
      .limit(1)
      .get();

    if (!snap.empty) {
      const u = snap.docs[0].data();
      const token =
        (u.expoToken as string) || (u.expoPushToken as string) || null;
      if (typeof token === "string" && token.startsWith("ExponentPushToken[")) {
        return token;
      }
    }
  } catch (e) {
    console.error("[getOwnerExpoToken] erro:", e);
  }
  return null;
}

export default async function notificarOwnerUsuarioCriado(
  req: Request,
  res: Response
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // ✅ agora recebemos nome e sobrenome direto do app
    const { uid, nome, sobrenome } = req.body || {};
    if (!nome || !sobrenome) {
      return res
        .status(400)
        .json({ error: "Envie 'nome' e 'sobrenome' no corpo da requisição." });
    }

    const ownerToken = await getOwnerExpoToken();
    if (!ownerToken) {
      console.warn("⚠️ Owner sem token válido salvo em 'usuarios'.");
      return res.status(200).json({
        success: true,
        sent: 0,
        message: "Owner sem Expo token salvo na coleção usuarios.",
      });
    }

    const nomeCompleto = `${nome} ${sobrenome}`.trim();

    const message = {
      to: ownerToken,
      sound: "default",
      title: "Novo usuário criado",
      body: nomeCompleto, // 👈 mostra apenas nome + sobrenome
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
      expoResult: result,
    });
  } catch (error) {
    console.error("❌ Erro ao notificar owner:", error);
    return res.status(500).json({ error: "Erro interno ao enviar notificação." });
  }
}
