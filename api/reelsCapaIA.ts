import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { v2 as cloudinary } from "cloudinary";
import admin from "firebase-admin";

dotenv.config();

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ FFmpeg no Render
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as string);
}

// ✅ Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

console.log("✅ Rota /reels/gerar-capa configurada.");

// Upload em memória (depois salvamos em /tmp)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024 }, // 120MB
});

function ensureTmpDir() {
  const tmp = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  return tmp;
}

function safeUnlink(p: string) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

async function extractCoverFrame(videoPath: string, outPngPath: string) {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(1.2)
      .outputOptions([
        "-frames:v 1",
        "-vf",
        // 9:16 vertical, central crop
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
      ])
      .output(outPngPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  if (!fs.existsSync(outPngPath)) {
    throw new Error("Falha ao extrair frame do vídeo.");
  }
}

/**
 * ✅ Compatível com versões do SDK que não tipam output_format/quality.
 * Retorna Buffer PNG quando vier b64_json; se não vier, joga erro (vai cair no fallback).
 */
async function tryEditWithIA(inputPngPath: string, estilo: string): Promise<Buffer> {
  const prompt = `
Transforme esta imagem em uma CAPA de Reels mais bonita e clean.
Regras:
- Preserve pessoas/objetos/composição (sem inventar elementos).
- Melhore nitidez, luz, cores e contraste (look profissional).
- Remova ruído/artefatos de compressão.
- NÃO adicione textos, logos, marcas d'água, molduras ou elementos novos.
- Manter formato vertical.
Estilo: ${estilo}.
`.trim();

  // ⚠️ Removido: output_format e quality (para não quebrar o TypeScript)
  const result = await openai.images.edit({
    model: "gpt-image-1.5",
    image: fs.createReadStream(inputPngPath) as any,
    prompt,
    size: "1024x1536",
  });

  const item: any = result?.data?.[0];
  const b64: string | undefined = item?.b64_json;

  if (!b64) {
    // Algumas versões podem retornar `url` ao invés de base64 (depende da lib/endpoint).
    // Se vier URL, você pode baixar e transformar em buffer — mas pra manter simples,
    // vamos forçar fallback (frame) quando não vier b64_json.
    const maybeUrl = item?.url;
    throw new Error(
      `IA não retornou b64_json${maybeUrl ? ` (url=${maybeUrl})` : ""}`
    );
  }

  return Buffer.from(b64, "base64");
}

async function uploadPngToCloudinary(pngPath: string, folder: string) {
  const r = await cloudinary.uploader.upload(pngPath, {
    folder,
    resource_type: "image",
    format: "png",
    overwrite: true,
  });

  return {
    secure_url: r.secure_url,
    public_id: r.public_id,
    width: r.width,
    height: r.height,
  };
}

/**
 * POST /reels/gerar-capa
 * multipart/form-data:
 *  - video: (arquivo vídeo)
 *  - reelsUrl: (opcional) link do reels só para registrar
 *  - titulo: (opcional)
 *  - estilo: (opcional) ex: "clean" | "cinematic"
 *  - colecao: (opcional) nome da coleção no Firestore (default: "reels")
 */
router.post("/reels/gerar-capa", upload.single("video"), async (req: Request, res: Response) => {
  const tmpDir = ensureTmpDir();

  let videoPath = "";
  let framePath = "";
  let finalPath = "";

  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "Envie o vídeo no campo 'video' (multipart/form-data).",
      });
    }

    const mime = req.file.mimetype || "";
    if (!mime.startsWith("video/")) {
      return res.status(400).json({ ok: false, error: "Arquivo não é vídeo." });
    }

    // ✅ garante que o firebase-admin já foi inicializado no send.ts
    if (!admin.apps.length) {
      return res.status(500).json({
        ok: false,
        error: "Firebase Admin não inicializado. Inicialize no send.ts antes de importar as rotas.",
      });
    }

    const reelsUrl = String(req.body?.reelsUrl || "").trim();
    const titulo = String(req.body?.titulo || "").trim();
    const estilo = String(req.body?.estilo || "clean").trim();
    const colecao = String(req.body?.colecao || "reels").trim();

    const stamp = Date.now();
    videoPath = path.join(tmpDir, `reel_${stamp}.mp4`);
    framePath = path.join(tmpDir, `frame_${stamp}.png`);
    finalPath = path.join(tmpDir, `capa_final_${stamp}.png`);

    // 1) salva vídeo
    fs.writeFileSync(videoPath, req.file.buffer);

    // 2) extrai frame (sempre)
    console.log("🎞️ Extraindo frame...");
    await extractCoverFrame(videoPath, framePath);

    // 3) tenta IA -> se falhar, usa frame
    let used: "ia" | "frame" = "ia";
    try {
      console.log("🧠 Tentando IA para capa...");
      const buf = await tryEditWithIA(framePath, estilo);
      fs.writeFileSync(finalPath, buf);
    } catch (e: any) {
      used = "frame";
      console.log("⚠️ IA falhou, usando fallback frame:", e?.message || e);
      fs.copyFileSync(framePath, finalPath);
    }

    // 4) upload no Cloudinary
    console.log("☁️ Enviando para Cloudinary...");
    const cloud = await uploadPngToCloudinary(finalPath, "mndd/reels_covers");

    // 5) salva no Firestore (reels + capa)
    console.log("🧾 Salvando no Firestore...");
    const docData = {
      reelsUrl: reelsUrl || null,
      titulo: titulo || null,
      estilo,
      capaUrl: cloud.secure_url,
      capaPublicId: cloud.public_id,
      capaWidth: cloud.width,
      capaHeight: cloud.height,
      capaOrigem: used, // "ia" | "frame"
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await admin.firestore().collection(colecao).add(docData);

    console.log("✅ Capa gerada e salva:", { id: ref.id, used, url: cloud.secure_url });

    return res.json({
      ok: true,
      id: ref.id,
      colecao,
      capaUrl: cloud.secure_url,
      capaOrigem: used,
      reelsUrl: reelsUrl || null,
      titulo: titulo || null,
    });
  } catch (err: any) {
    console.error("❌ Erro /reels/gerar-capa:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "Erro ao gerar capa.",
      detail: err?.message || String(err),
    });
  } finally {
    safeUnlink(videoPath);
    safeUnlink(framePath);
    safeUnlink(finalPath);
  }
});

export default router;