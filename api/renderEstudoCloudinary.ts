// api/renderEstudo.ts
import { Request, Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import admin from "firebase-admin";

// garanta que o admin já esteja inicializado em outro ponto do app
// admin.initializeApp({...})

const db = admin.firestore();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const renderEstudoCloudinary = [
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Envie um arquivo PDF ou PPTX." });
      }

      const { tema = "Sem Tema", titulo = "Estudo" } = req.body || {};

      // 1) upload para Cloudinary (auto lida com pdf/pptx)
      const up = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "estudos", resource_type: "auto" },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(req.file!.buffer);
      });

      const publicId: string = up.public_id;
      const totalPages: number = up.pages || 1;

      // 2) gera URLs de cada página (jpg) — Cloudinary usa o parâmetro `page`
      const pages: string[] = Array.from({ length: totalPages }, (_, i) =>
        cloudinary.url(publicId, {
          secure: true,
          format: "jpg",
          transformation: [
            { page: i + 1, density: 300 },             // aumenta DPI do PDF -> imagem (padrão é ~72)
            { width: 2400, crop: "scale" },            // largura grande para zoom sem pixelar
            { fetch_format: "auto", quality: "auto:best" }, // usa WebP/AVIF quando possível e prioriza nitidez
            { effect: "sharpen:50" },                  // reforça contornos do texto
            { flags: "progressive:steep" },            // carrega gradualmente (melhor UX)
          ],
        })
      );

      // 3) salva no Firestore
      const docRef = await db.collection("estudos_biblicos").add({
        tema,
        titulo,
        pages,
        pageCount: totalPages,
        publicId,
        provider: "cloudinary",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 4) responde com id (para o app reusar depois) e páginas para preview imediato
      return res.json({
        ok: true,
        id: docRef.id,
        pages,
        pageCount: totalPages,
      });
    } catch (e) {
      console.error("Erro renderEstudo:", e);
      return res.status(500).json({ error: "Falha ao processar arquivo." });
    }
  },
];
