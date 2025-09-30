import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/resumo-capitulo", async (req: Request, res: Response) => {
  const { bookName, bookAbbrev, chapterNumber, bibleVersion } = req.body;

  if (!bookName || !chapterNumber) {
    return res
      .status(400)
      .json({ error: "Informe bookName e chapterNumber." });
  }

  const prompt = `
Faça um resumo claro, simples e acolhedor do capítulo ${chapterNumber} de ${bookName} (${bookAbbrev || ""}),
na versão ${bibleVersion || "ACF"}.
Mantenha-se estritamente no contexto bíblico e cite versículos quando apropriado (ex.: v.3-5).
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente bíblico cristão do Ministério Nascido de Deus (MNDD). " +
            "Responda de forma clara, simples e acolhedora, citando versículos quando apropriado. " +
            "Mantenha-se estritamente no contexto bíblico.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 700,
    });

    const resumo = completion.choices[0]?.message?.content?.trim() ?? "";
    return res.status(200).json({ resumo });
  } catch (error: any) {
    console.error("❌ [ResumoCapítulo] Erro:", error?.message || error);
    return res.status(500).json({ error: "Erro ao gerar resumo." });
  }
});

export default router;
