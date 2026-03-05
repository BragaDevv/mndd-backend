import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import admin from "firebase-admin"; // ✅ usa o singleton já inicializado no send.ts

dotenv.config();

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Log ao inicializar
console.log("✅ Rota /videos-ia configurada.");

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

function sanitizeOneLine(s: string): string {
  if (!s) return s;
  let t = s.trim();
  t = t.replace(/^[“”"‘’']+/, "").replace(/[“”"‘’']+$/, "");
  t = t.replace(/\s*\n+\s*/g, " ");
  t = t.replace(/\s{2,}/g, " ");
  return t;
}

function clampLen(s: string, max = 60): string {
  if (s.length <= max) return s;
  const cutAt = Math.max(s.lastIndexOf(" ", max), s.lastIndexOf(".", max));
  return (cutAt > 20 ? s.slice(0, cutAt) : s.slice(0, max)).trim();
}

function buildFrameUrl(videoPublicId: string) {
  return cloudinary.url(videoPublicId, {
    resource_type: "video",
    format: "jpg",
    transformation: [
      { so: 1 }, // pega frame em ~1s
      { f: "jpg" },
      { w: 900, c: "limit" },
      { q: "auto" },
    ],
  });
}

function buildCoverPrompt(titulo: string) {
  const t = clampLen(sanitizeOneLine(titulo || "Vídeo MNDD"), 60);

  return `
Crie uma CAPA QUADRADA (1:1) estilo Reels para um app cristão (MNDD).
Use a imagem enviada como referência (frame do vídeo), mantendo o assunto principal em destaque.

Estilo:
- moderno, clean, luz suave, alto contraste, aparência premium
- fundo com leve gradiente e brilho sutil, sem poluição visual
- tipografia forte e MUITO legível (alto contraste), sem texto pequeno

Texto na capa (apenas este, sem aspas):
${t}

Regras:
- não colocar marcas d'água
- não colocar logos de redes sociais
- não inventar versículos
- manter composição bonita e central
`;
}

async function generateCoverBase64(frameUrl: string, titulo: string) {
  const prompt = buildCoverPrompt(titulo);

  // ✅ Correção principal: incluir `detail`
  const resp = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: frameUrl, detail: "auto" },
        ],
      },
    ],
    tools: [{ type: "image_generation" }],
  });

  const out: any[] = (resp as any).output || [];
  const imgNode = out.find((n) => n.type === "image_generation");
  const base64 = imgNode?.result?.base64;

  if (!base64 || typeof base64 !== "string") {
    throw new Error("IA não retornou base64 de imagem (image_generation).");
  }

  return base64;
}

async function uploadCoverToCloudinary(base64: string, coverPublicId: string) {
  const dataUrl = `data:image/png;base64,${base64}`;

  const up = await cloudinary.uploader.upload(dataUrl, {
    resource_type: "image",
    folder: "mndd/video_covers",
    public_id: coverPublicId,
    overwrite: true,
    format: "jpg",
  });

  return up.secure_url;
}

/**
 * POST /api/videos-ia/gerar-capa
 * body:
 * {
 *   "videoPublicId": "mndd/videos/abc123",
 *   "titulo": "Culto de Domingo",
 *   "firestoreDocPath": "videos_mndd/ID_DO_DOC" // opcional
 * }
 */
router.post("/videos-ia/gerar-capa", async (req: Request, res: Response) => {
  try {
    let { videoPublicId, titulo, firestoreDocPath } = req.body as {
      videoPublicId?: string;
      titulo?: string;
      firestoreDocPath?: string;
    };

    if (!videoPublicId || typeof videoPublicId !== "string" || !videoPublicId.trim()) {
      return res.status(400).json({ ok: false, error: "Envie videoPublicId (string)." });
    }

    videoPublicId = videoPublicId.trim();
    titulo = typeof titulo === "string" ? titulo.trim() : "Vídeo MNDD";

    console.log(`🎬 [CAPA IA] Iniciando | publicId="${videoPublicId}" | titulo="${titulo}"`);

    const frameUrl = buildFrameUrl(videoPublicId);
    console.log("🖼️ [CAPA IA] Frame URL:", frameUrl);

    const base64 = await generateCoverBase64(frameUrl, titulo);

    const safeName = videoPublicId.split("/").pop() || "video";
    const coverPublicId = `cover_${safeName}`;

    const thumbnailUrl = await uploadCoverToCloudinary(base64, coverPublicId);

    console.log("✅ [CAPA IA] Capa enviada Cloudinary:", thumbnailUrl);

    // ✅ Firestore opcional (mantendo seu padrão)
    if (firestoreDocPath && typeof firestoreDocPath === "string" && firestoreDocPath.includes("/")) {
      try {
        await admin.firestore().doc(firestoreDocPath).update({
          thumbnailUrl,
          status: "ready",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log("✅ [CAPA IA] Firestore atualizado:", firestoreDocPath);
      } catch (e: any) {
        console.warn("⚠️ [CAPA IA] Falhou update Firestore (não bloqueia):", e?.message || e);
      }
    }

    return res.json({
      ok: true,
      thumbnailUrl,
      frameUrl,
    });
  } catch (err: any) {
    console.error("❌ Erro CAPA IA:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "Erro ao gerar capa IA.",
      detail: String(err?.message || err),
    });
  }
});

export default router;