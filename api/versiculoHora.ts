//Salva e retorna o horário configurado para envio automático do versículo do dia na coleção configuracoes.//
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

import { Request, Response } from "express";
import admin from "firebase-admin";

export default async function versiculoHoraHandler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { hora } = req.body;

  if (!hora || !/^\d{2}:\d{2}$/.test(hora)) {
    return res.status(400).json({ error: "Hora inválida. Use o formato HH:mm" });
  }

  try {
    await admin.firestore().collection("configuracoes").doc("versiculo").set({ hora });
    res.status(200).json({ success: true, hora });
  } catch (error) {
    console.error("❌ Erro ao salvar hora:", error);
    res.status(500).json({ error: "Erro ao salvar horário." });
  }
}
