// Envia push SÓ para o owner quando um usuário é criado.
// POST /notify/owner/user-created  { uid, email?, displayName?, providerId?, createdAt? }

import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

const db = admin.firestore();
const OWNER_EMAIL = process.env.OWNER_EMAIL || "bragadevv@gmail.com";

/** Lê o token do owner:
 *  1) tenta em config_app/owner.expoToken | expoPushToken
 *  2) fallback: usuarios where email == OWNER_EMAIL
 */
async function getOwnerExpoToken(): Promise<string | null> {
  try {
    // 1) config_app/owner
    const ownerCfg = await db.doc("config_app/owner").get();
    if (ownerCfg.exists) {
      const data = ownerCfg.data() || {};
      const token =
        (data.expoToken as string) || (data.expoPushToken as string) || null;
      if (typeof token === "string" && token.startsWith("ExponentPushToken[")) {
        return token;
      }
    }

    // 2) usuarios (pelo email)
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
      console.warn("⚠️ Owner sem token válido salvo.");
      return res.status(200).json({
        success: true,
        sent: 0,
        message: "Owner sem Expo token salvo em config_app/owner ou usuarios.",
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

    // Envia 1 (um) push para o owner
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
