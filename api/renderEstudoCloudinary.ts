import { Request, Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

// 🔹 Configura Cloudinary com variáveis de ambiente
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

// 🔹 Usa multer para upload temporário em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // até 25MB
});

export const renderEstudoCloudinary = [
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Envie um arquivo (PDF ou PPTX)." });
      }

      // Faz upload para Cloudinary
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "estudos",
            resource_type: "auto", // aceita PDF, PPTX, DOCX, etc.
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file!.buffer);
      });

      const publicId = uploadResult.public_id;
      const format = uploadResult.format;
      const pages = uploadResult.pages || 1; // PDFs retornam o total de páginas

      // Gera URLs de imagem de cada página (Cloudinary converte automaticamente!)
      const urls = Array.from({ length: pages }, (_, i) =>
        cloudinary.url(`${publicId}.jpg`, {
          transformation: [{ page: i + 1 }],
        })
      );

      res.json({
        ok: true,
        source: { format, name: req.file.originalname },
        count: pages,
        pages: urls,
      });
    } catch (error) {
      console.error("Erro ao processar estudo:", error);
      res.status(500).json({ error: "Erro ao converter arquivo." });
    }
  },
];
