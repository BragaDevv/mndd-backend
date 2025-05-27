import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import versiculos from "../data/versiculos.json";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const dia = new Date().getDate();
    const versiculo = versiculos[dia % versiculos.length];

    const snapshot = await admin.firestore().collection("pushTokens").get();
    const tokens = snapshot.docs
      .map((doc) => doc.data().token)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, message: "Nenhum token válido encontrado." });
    }

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: "📖 Versículo do Dia",
      body: `${versiculo.texto} (${versiculo.livro} ${versiculo.capitulo}:${versiculo.versiculo})`,
    }));

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await expoResponse.json();

    res.json({ success: true, sent: tokens.length, versiculo, expoResult: result });
  } catch (error) {
    console.error("❌ Erro ao enviar versículo:", error);
    res.status(500).json({ error: "Erro interno ao enviar versículo." });
  }
}
