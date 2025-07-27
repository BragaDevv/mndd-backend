import { Request, Response } from "express";
import multer from "multer";
import admin from "firebase-admin";
import fetch from "node-fetch";
import FormData from "form-data";

const storage = multer.memoryStorage();
export const upload = multer({ storage }).single("pdf");

// 🔧 Envia PDF para Cloudinary
async function uploadPdfToCloudinary(buffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", buffer, filename);
  formData.append("upload_preset", "mndd_unsigned");
  formData.append("folder", "estudos_pdf");
  formData.append("resource_type", "raw"); // ✅ mantém, pois define que é um arquivo genérico

  const response = await fetch("https://api.cloudinary.com/v1_1/dy48gdjlv/raw/upload", {
    method: "POST",
    body: formData as any,
  });

  const data = (await response.json()) as { secure_url?: string; error?: { message?: string } };

  if (!response.ok || !data.secure_url) {
    console.error("❌ Erro no Cloudinary:", data);
    throw new Error(data?.error?.message || "Falha ao enviar PDF para o Cloudinary");
  }

  return data.secure_url;
}


// 📥 Manipulador principal
export async function uploadEstudoPDFHandler(req: Request, res: Response) {
  try {
    const tema = req.body.tema || "Geral";
    const titulo = req.body.titulo || "Estudo em PDF";

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo PDF enviado." });
    }

    const urlPDF = await uploadPdfToCloudinary(req.file.buffer, req.file.originalname);

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      urlPDF,
      dataPublicacao: new Date().toISOString(),
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true, urlPDF });
  } catch (err: any) {
    console.error("❌ Erro ao fazer upload do PDF:", err);
    return res.status(500).json({ error: err.message || "Erro ao enviar o estudo em PDF." });
  }
}
