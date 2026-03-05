import { Router, Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// Cloudinary
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "dy48gdjlv";

/**
 * Retorna um frame simples do vídeo como JPG:
 * https://res.cloudinary.com/<cloud>/video/upload/<publicId>.jpg
 */
function cloudinaryFrameUrl(publicId: string) {
  const clean = (publicId || "").trim().replace(/^\/+|\/+$/g, "");
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${clean}.jpg`;
}

router.post("/videos-ia/gerar-capa", async (req: Request, res: Response) => {
  try {
    const { videoPublicId } = req.body as { videoPublicId?: string };

    if (!videoPublicId || typeof videoPublicId !== "string") {
      return res.status(400).json({ ok: false, error: "videoPublicId é obrigatório." });
    }

    const thumbnailUrl = cloudinaryFrameUrl(videoPublicId);

    console.log(`🖼️ [CAPA FRAME] OK | publicId="${videoPublicId}"`);
    return res.json({
      ok: true,
      thumbnailUrl,
      capaOrigem: "frame",
      videoPublicId,
    });
  } catch (err: any) {
    console.error("❌ [CAPA FRAME] Erro:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Erro ao gerar capa." });
  }
});

export default router;