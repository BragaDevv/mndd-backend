// Envia o versículo do dia via push notification para todos os DEVICES logados (isLoggedIn == true)

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

// evita body gigante
function safeBody(input: string, max = 220) {
  const s = (input ?? "").toString().trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const dia = new Date().getDate();
    const versiculo = versiculos[dia % versiculos.length];

    console.log("[VERSICULO] buscando devices logados...");

    const snap = await admin
      .firestore()
      .collectionGroup("devices")
      .where("isLoggedIn", "==", true)
      .get();

    console.log("[VERSICULO] devices encontrados:", snap.size);

    const tokens = snap.docs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    const uniqueTokens = Array.from(new Set(tokens));
    console.log("[VERSICULO] tokens validos (unicos):", uniqueTokens.length);

    if (uniqueTokens.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        message: "Nenhum token válido encontrado (devices logados).",
      });
    }

    const body = safeBody(
      `${versiculo.texto} (${versiculo.livro} ${versiculo.capitulo}:${versiculo.versiculo})`,
      220
    );

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "📖 Versículo do Dia",
      body,
    }));

    const chunkSize = 100;
    const chunks: any[] = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }

    const results: any[] = [];

    for (const [idx, chunk] of chunks.entries()) {
      console.log(`[VERSICULO] enviando chunk ${idx + 1}/${chunks.length} (${chunk.length} msgs)`);

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

      // tenta JSON, se falhar cai pra texto (pra não explodir)
      let payload: any = null;
      try {
        payload = await expoResponse.json();
      } catch {
        const txt = await expoResponse.text();
        payload = { error: "non-json-response", status, raw: txt?.slice(0, 500) };
      }

      if (status < 200 || status >= 300) {
        console.error("[VERSICULO] Expo retornou erro:", status, payload);
      }

      results.push({ status, payload });
    }

    return res.status(200).json({
      success: true,
      sent: uniqueTokens.length,
      versiculo,
      expoResult: results,
    });
  } catch (error: any) {
    console.error("❌ Erro ao enviar versículo:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });

    return res.status(500).json({ error: "Erro interno ao enviar versículo." });
  }
}
