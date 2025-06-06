import { Request, Response } from "express";
import admin from "firebase-admin";

export default async function versiculoHoraHandler(req: Request, res: Response) {
  const docRef = admin.firestore().collection("configuracoes").doc("versiculo");

  if (req.method === "GET") {
    try {
      const doc = await docRef.get();
      const data = doc.data();
      return res.status(200).json({ hora: data?.hora || "08:00" });
    } catch (error) {
      console.error("❌ Erro ao buscar hora:", error);
      return res.status(500).json({ error: "Erro ao buscar horário." });
    }
  }

  if (req.method === "POST") {
    const { hora } = req.body;

    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) {
      return res.status(400).json({ error: "Hora inválida. Use o formato HH:mm" });
    }

    try {
      await docRef.set({ hora });
      return res.status(200).json({ success: true, hora });
    } catch (error) {
      console.error("❌ Erro ao salvar hora:", error);
      return res.status(500).json({ error: "Erro ao salvar horário." });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
