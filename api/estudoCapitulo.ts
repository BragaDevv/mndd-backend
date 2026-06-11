// api/estudoCapitulo.ts
import { Router, Request, Response } from "express";
import OpenAI from "openai";
import admin from "firebase-admin";

const router = Router();
const db = admin.firestore();

const COLLECTION = "estudos_capitulos";
const PROMPT_VERSION = 1;
const BACKEND_URL = process.env.BACKEND_URL || "https://mndd-backend-8hr0.onrender.com";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const docIdFor = (bookAbbrev: string, chapterNumber: number) =>
  `${String(bookAbbrev).toLowerCase()}-${Number(chapterNumber)}`;

interface EstudoData {
  resumo: string;
  trechos: { ref: string; explicacao: string }[];
  palavrasChave: { termo: string; explicacao: string }[];
  curiosidades: string[];
}

async function gerarComOpenAI(
  bookName: string,
  bookAbbrev: string,
  chapterNumber: number
): Promise<EstudoData> {
  const system = `Você é um teólogo evangélico do MNDD. Responda SOMENTE com JSON válido, sem markdown.
Doutrina: cristologia bíblica, graça, redenção. Nunca especule além da Bíblia.
Use a Bíblia como fonte única de verdade.`;

  const user = `Gere um estudo teológico do capítulo ${chapterNumber} de ${bookName}.
Responda com este JSON exato (sem markdown, sem blocos de código):
{
  "resumo": "2-3 parágrafos contextualizando o capítulo",
  "trechos": [{"ref": "v.3-5", "explicacao": "explicação do trecho"}],
  "palavrasChave": [{"termo": "termo", "explicacao": "explicação"}],
  "curiosidades": ["fato 1", "fato 2"]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
    max_tokens: 1200,
  });

  const content = completion.choices[0]?.message?.content?.trim() || "";

  // Limpa markdown se houver
  const cleaned = content
    .replace(/^```json\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  const data = JSON.parse(cleaned) as EstudoData;
  return data;
}

router.post("/estudo-capitulo", async (req: Request, res: Response) => {
  try {
    const { bookName, bookAbbrev, chapterNumber } = req.body as {
      bookName: string;
      bookAbbrev: string;
      chapterNumber: number;
    };

    if (!bookName || !bookAbbrev || !chapterNumber) {
      return res.status(400).json({
        error: "Informe bookName, bookAbbrev e chapterNumber.",
      });
    }

    const docId = docIdFor(bookAbbrev, chapterNumber);
    const docRef = db.collection(COLLECTION).doc(docId);

    // Checa cache
    const snap = await docRef.get();
    if (
      snap.exists &&
      snap.data()?.status === "ready" &&
      snap.data()?.promptVersion === PROMPT_VERSION
    ) {
      console.log("✅ [CACHE] Firestore:", docId);
      return res.status(200).json({ status: "ready" });
    }

    // Guarda de concorrência
    if (snap.exists && snap.data()?.status === "generating") {
      console.log("⏳ [GENERATING] Já em geração:", docId);
      return res.status(202).json({ status: "generating" });
    }

    // Reserva o doc
    console.log("🔄 [RESERVE] Iniciando geração:", docId);
    await docRef.set({
      status: "generating",
      bookName,
      bookAbbrev,
      chapterNumber,
      promptVersion: PROMPT_VERSION,
      geradoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(202).json({ status: "generating" });

    // Fire-and-forget
    gerarComOpenAI(bookName, bookAbbrev, chapterNumber)
      .then(async (estudo) => {
        await docRef.set(
          {
            ...estudo,
            status: "ready",
            bookName,
            bookAbbrev,
            chapterNumber,
            promptVersion: PROMPT_VERSION,
            geradoEm: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        console.log("✅ [SAVED] Estudo salvo:", docId);
      })
      .catch(async (e) => {
        console.error("❌ [ERROR] Falha na geração:", docId, e?.message);
        await docRef.update({ status: "error" });
      });
  } catch (error: any) {
    console.error("❌ [EstudoCapítulo] Erro:", error?.message || error);
    return res.status(500).json({ error: "Erro ao processar estudo." });
  }
});

export default router;
