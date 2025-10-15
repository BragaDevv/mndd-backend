// api/resumoCapitulo.ts
import { Router, Request, Response } from "express";
import OpenAI from "openai";
import admin from "firebase-admin";

const router = Router();

// usa a instância já inicializada no index principal
const db = admin.firestore();

// coleção e versão do prompt (mude para invalidar todos)
const COLLECTION = "resumos_capitulos";
const PROMPT_VERSION = 1;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// monta um id único para o doc
const docIdFor = (bookAbbrev: string, chapterNumber: number, bibleVersion: string) =>
  `${String(bookAbbrev).toLowerCase()}-${Number(chapterNumber)}-${String(bibleVersion).toUpperCase()}`;

router.post("/resumo-capitulo", async (req: Request, res: Response) => {
  try {
    const { bookName, bookAbbrev, chapterNumber, bibleVersion } = req.body as {
      bookName: string;
      bookAbbrev: string;
      chapterNumber: number;
      bibleVersion: "ACF" | "AA" | "NIV" | "KJF";
    };
    const force = String(req.query.force ?? "0") === "1"; // /resumo-capitulo?force=1

    if (!bookName || !bookAbbrev || !chapterNumber || !bibleVersion) {
      return res.status(400).json({ error: "Informe bookName, bookAbbrev, chapterNumber e bibleVersion." });
    }

    const docId = docIdFor(bookAbbrev, chapterNumber, bibleVersion);
    const docRef = db.collection(COLLECTION).doc(docId);

    // 1) tenta cache do Firestore
    if (!force) {
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data();
        if (data?.promptVersion === PROMPT_VERSION && typeof data?.resumo === "string") {
          console.log("✅ [CACHE] Firestore:", docId);
          return res.status(200).json({ resumo: data.resumo });
        }
      }
    }

    // 2) gera com OpenAI
    const system =
      "Você é um assistente bíblico cristão do Ministério Nascido de Deus (MNDD). " +
      "Responda de forma clara, simples e acolhedora, citando versículos quando apropriado. " +
      "Mantenha-se estritamente no contexto bíblico.";

    const user = `
Faça um resumo claro, simples e acolhedor do capítulo ${chapterNumber} de ${bookName} (${bookAbbrev}).
Sempre inicie com "No capítulo ${chapterNumber} de ${bookName}, ..."
Mantenha-se estritamente no contexto bíblico e cite versículos quando apropriado (ex.: v.3-5).
Versão base: ${bibleVersion}.
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 700,
    });

    const resumo = completion.choices[0]?.message?.content?.trim() || "Resumo não disponível no momento.";

    // 3) salva/atualiza no Firestore
    await docRef.set(
      {
        resumo,
        bookName,
        bookAbbrev,
        chapterNumber,
        bibleVersion,
        promptVersion: PROMPT_VERSION,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log("💾 [SAVE] Firestore:", docId);
    return res.status(200).json({ resumo });
  } catch (error: any) {
    console.error("❌ [ResumoCapítulo] Erro:", error?.message || error);
    return res.status(500).json({ error: "Erro ao gerar resumo." });
  }
});

export default router;
