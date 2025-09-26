import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "bragadevv@gmail.com";

// Busca o token do owner dentro de usuarios, filtrando por email
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
    const { uid, email, displayName, providerId, createdAt } = req.body || {};
    if (!uid && !email) {
      return res
        .status(400)
        .json({ error: "Informe ao menos uid ou email no corpo da requisição." });
    }

    const ownerToken = await getOwnerExpoToken();
    if (!ownerToken) {
      console.warn("⚠️ Owner sem token válido salvo em usuarios.");
      return res.status(200).json({
        success: true,
        sent: 0,
        message: "Owner sem Expo token salvo na coleção usuarios.",
      });
    }

    const message = {
      to: ownerToken,
      sound: "default",
      title: "Novo usuário criado",
      body: email ? `Conta criada: ${email}` : `Cadastro criado (UID: ${uid})`,
      data: {
        event: "auth_user_created",
        uid: uid ?? null,
        email: email ?? null,
        displayName: displayName ?? null,
        providerId: providerId ?? null,
        createdAt: createdAt ?? Date.now(),
      },
      priority: "high" as const,
    };

    // Envia push para o Expo
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
