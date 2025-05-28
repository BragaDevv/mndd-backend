//Envia o versículo do dia via push notification para todos os usuários que possuem token válido na coleção usuarios.//
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import versiculos from "../data/versiculos.json";

export default async function handler(req: Request, res: Response) {
  // Garante que apenas POST é aceito
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // Seleciona o versículo com base no dia atual
    const dia = new Date().getDate();
    const versiculo = versiculos[dia % versiculos.length];

    // Busca os tokens da coleção 'usuarios'
    const snapshot = await admin.firestore().collection("usuarios").get();
    const tokens = snapshot.docs
      .map((doc) => doc.data().expoToken) // ou 'expoPushToken' se for esse o campo usado no app
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

    if (tokens.length === 0) {
      console.warn("⚠️ Nenhum token válido encontrado para envio do versículo.");
      return res.status(200).json({ success: true, sent: 0, message: "Nenhum token válido encontrado." });
    }

    // Monta as mensagens
    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: "📖 Versículo do Dia",
      body: `${versiculo.texto} (${versiculo.livro} ${versiculo.capitulo}:${versiculo.versiculo})`,
    }));

    // Envia para a Expo Push API
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

    res.status(200).json({
      success: true,
      sent: tokens.length,
      versiculo,
      expoResult: result,
    });
  } catch (error) {
    console.error("❌ Erro ao enviar versículo:", error);
    res.status(500).json({ error: "Erro interno ao enviar versículo." });
  }
}
