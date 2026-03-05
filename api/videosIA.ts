import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ pega cloud name do env (ou hardcode se preferir)
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "dy48gdjlv";

// ✅ util: cria URL de frame do Cloudinary (thumbnail padrão)
function cloudinaryVideoFrameUrl(publicId: string) {
  const clean = (publicId || "").replace(/^\/+|\/+$/g, "");
  // jpg gerado automaticamente a partir do vídeo
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${clean}.jpg`;
}

// ✅ util: sanitiza prompt
function sanitizeOneLine(s: string) {
  return (s || "").trim().replace(/\s*\n+\s*/g, " ");
}

router.post("/videos-ia/gerar-capa", async (req: Request, res: Response) => {
  try {
    const { videoPublicId, titulo } = req.body as {
      videoPublicId?: string;
      titulo?: string;
    };

    if (!videoPublicId || typeof videoPublicId !== "string") {
      return res.status(400).json({ ok: false, error: "videoPublicId é obrigatório." });
    }

    const title = sanitizeOneLine(titulo || "Vídeo MNDD");

    console.log(`🎬 [CAPA IA] Iniciando | publicId="${videoPublicId}" | titulo="${title}"`);

    // ✅ fallback sempre disponível
    const frameUrl = cloudinaryVideoFrameUrl(videoPublicId);
    console.log("🖼️ [CAPA IA] Frame URL:", frameUrl);

    // =========================
    // ✅ TENTAR IA (opcional)
    // =========================
    try {
      // Se sua conta não tem verificação, use um modelo que você já confirmou que funciona:
      const model = process.env.OPENAI_CAPA_MODEL || "gpt-4o-mini";

      // ⚠️ Observação importante:
      // - Não é “gerar imagem” aqui (isso exigiria image model).
      // - Aqui a IA pode sugerir melhorias / validação / texto para overlay etc.
      // - Se seu fluxo atual realmente gera a imagem via IA, aí precisa de outro endpoint/modelo.
      // Para manter seu pipeline HOJE funcionando, retornamos a capa como frame.
      //
      // Mesmo assim, deixo uma chamada leve só para validar que a IA está OK
      // (e você pode expandir depois pra gerar um layout/capa de verdade).
      await openai.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 30,
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente que valida títulos curtos e sugere variações bem curtas (sem aspas).",
          },
          {
            role: "user",
            content: `Valide se o título está ok para capa: "${title}". Responda apenas "OK" ou "AJUSTAR".`,
          },
        ],
      });

      // ✅ Se chegou aqui, a IA está acessível (mas a imagem ainda é o frame por enquanto)
      return res.json({
        ok: true,
        thumbnailUrl: frameUrl,
        capaOrigem: "frame", // por enquanto é frame; se você gerar imagem real, troque para "ia"
        videoPublicId,
      });
    } catch (err: any) {
      // ✅ Se IA falhar (403, etc.), segue o jogo com frame
      console.error("❌ [CAPA IA] IA indisponível, usando fallback frame:", err?.message || err);

      return res.json({
        ok: true,
        thumbnailUrl: frameUrl,
        capaOrigem: "frame",
        videoPublicId,
        warning: "IA indisponível. Retornando frame do vídeo.",
      });
    }
  } catch (err: any) {
    console.error("❌ Erro CAPA IA (geral):", err?.message || err);
    return res.status(500).json({ ok: false, error: "Erro ao gerar capa." });
  }
});

export default router;