// routes/versiculo.ts (ou onde estiver seu handler)
// Envia o versículo do dia via push para TODOS os DEVICES logados em push_devices

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

    console.log("[VERSICULO] buscando push_devices logados...");

    // ✅ Sem collectionGroup. Sem índice composto chato.
    // (pode até funcionar sem índice, mas se pedir, é índice simples no campo isLoggedIn)
    const snap = await admin
      .firestore()
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    console.log("[VERSICULO] push_devices encontrados:", snap.size);

    const tokens = snap.docs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    // ✅ remove duplicados (se o mesmo token aparecer repetido)
    const uniqueTokens = Array.from(new Set(tokens));
    console.log("[VERSICULO] tokens validos (unicos):", uniqueTokens.length);

    if (uniqueTokens.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        message: "Nenhum token válido encontrado (push_devices logados).",
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

    // ✅ Expo recomenda chunks de até 100
    const chunkSize = 100;
    const results: any[] = [];

    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = messages.slice(i, i + chunkSize);
      console.log(
        `[VERSICULO] enviando chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(
          messages.length / chunkSize
        )} (${chunk.length} msgs)`
      );

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
      details: error?.details,
      code: error?.code,
      stack: error?.stack,
    });
    return res.status(500).json({ error: "Erro interno ao enviar versículo." });
  }
}
