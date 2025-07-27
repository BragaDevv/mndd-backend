// api/uploadEstudoPDF.ts
import { Request, Response } from "express";
import admin from "firebase-admin";

export async function uploadEstudoPDFHandler(req: Request, res: Response) {
  try {
    const { tema = "Geral", titulo = "Estudo PDF", urlPDF } = req.body;

    if (!urlPDF) {
      return res.status(400).json({ error: "URL do PDF ausente." });
    }

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      urlPDF,
      dataPublicacao: new Date().toISOString(),
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Erro ao salvar estudo:", err);
    return res.status(500).json({ error: "Erro ao salvar estudo." });
  }
}
