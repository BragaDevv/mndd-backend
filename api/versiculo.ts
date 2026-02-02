// Envia o versículo do dia via push notification para todos os DEVICES logados (isLoggedIn == true)
// =================================================================================================

import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import versiculos from "../data/versiculos.json";

function isValidExpoToken(t: any): t is string {
  return (
    typeof t === "string" &&
    (t.startsWith("ExpoPushToken[") || t.startsWith("ExponentPushToken["))
  );
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // Versículo do dia
    const dia = new Date().getDate();
    const versiculo = versiculos[dia % versiculos.length];

    // ✅ Busca tokens apenas dos devices logados
    const snap = await admin
      .firestore()
      .collectionGroup("devices")
      .where("isLoggedIn", "==", true)
      .get();

    // Pega tokens válidos
    const tokens = snap.docs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    // (opcional) remove duplicados, caso o mesmo token apareça mais de uma vez
    const uniqueTokens = Array.from(new Set(tokens));

    if (uniqueTokens.length === 0) {
      console.warn("⚠️ Nenhum token válido encontrado (devices logados).");
      return res.status(200).json({
        success: true,
        sent: 0,
        message: "Nenhum token válido encontrado (devices logados).",
      });
    }

    // Monta mensagens
    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "📖 Versículo do Dia",
      body: `${versiculo.texto} (${versiculo.livro} ${versiculo.capitulo}:${versiculo.versiculo})`,
    }));

    // ✅ Expo recomenda enviar em chunks (até 100 por request)
    const chunkSize = 100;
    const chunks: any[] = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }

    const results: any[] = [];
    for (const chunk of chunks) {
      const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      const json = await expoResponse.json();
      results.push(json);
    }

    return res.status(200).json({
      success: true,
      sent: uniqueTokens.length,
      versiculo,
      expoResult: results,
    });
  } catch (error) {
    console.error("❌ Erro ao enviar versículo:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao enviar versículo." });
  }
}
