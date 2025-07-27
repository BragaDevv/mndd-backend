// uploadEstudoPDF.ts
import { Request, Response } from "express";
import multer from "multer";
import admin from "firebase-admin";
import fetch from "node-fetch";
import FormData from "form-data";

const storage = multer.memoryStorage();
export const upload = multer({ storage }).single("pdf");

// Função para enviar para Cloudinary
async function uploadPdfToCloudinary(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const formData = new FormData();
  formData.append("file", buffer, filename);
  formData.append("upload_preset", "mndd_unsigned"); // seu preset
  formData.append("folder", "estudos_pdf");

  const res = await fetch(
    "https://api.cloudinary.com/v1_1/dy48gdjlv/raw/upload",
    {
      method: "POST",
      body: formData as any,
    }
  );

  const data = (await res.json()) as { secure_url: string };
  return data.secure_url;
}

export async function uploadEstudoPDFHandler(req: Request, res: Response) {
  try {
    const tema = req.body.tema || "Geral";
    const titulo = req.body.titulo || "Estudo em PDF";

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo PDF enviado." });
    }

    const urlPDF = await uploadPdfToCloudinary(
      req.file.buffer,
      req.file.originalname
    );

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      urlPDF,
      dataPublicacao: new Date().toISOString(),
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true, urlPDF });
  } catch (err) {
    console.error("Erro ao fazer upload do PDF:", err);
    return res.status(500).json({ error: "Erro ao enviar o estudo em PDF." });
  }
}
