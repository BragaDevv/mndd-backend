import OpenAI from "openai";
import express, { Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Log de inicialização da rota
console.log("✅ Rota /ask da OpenAI configurada.");

router.post("/ask", async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt) {
    console.warn("❌ Prompt não fornecido.");
    return res.status(400).json({ error: "Prompt não fornecido." });
  }

  console.log(`📩 [OpenAI] Requisição recebida com prompt: ${prompt}`);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente bíblico cristão do Ministério Nascido de Deus (MNDD). " +
            "Responda de forma clara, simples e acolhedora, citando versículos quando apropriado. " +
            "Mantenha-se estritamente no contexto bíblico. " +
            "Se perguntarem sobre cultos ou eventos da igreja, informe que pode verificar os próximos eventos. " +
            "Para informações sobre cultos, diga apenas: 'Por favor, pergunte especificamente sobre os cultos para que eu possa verificar.'",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const result = completion.choices[0]?.message?.content;
    console.log("✅ [OpenAI] Resposta gerada:", result);

    return res.status(200).json({ result });
  } catch (error: any) {
    console.error(
      "❌ [OpenAI] Erro ao consultar OpenAI:",
      error?.message || error
    );
    return res.status(500).json({ error: "Erro ao consultar OpenAI." });
  }
});

router.post("/resumo-capitulo", async (req: Request, res: Response) => {
  const { bookName, bookAbbrev, chapterNumber, bibleVersion } = req.body;

  if (!bookName || !chapterNumber) {
    console.warn("❌ Dados inválidos para resumo-capitulo.");
    return res.status(400).json({ error: "Informe bookName e chapterNumber." });
  }

  const prompt = `
Faça um resumo claro, simples e acolhedor do capítulo ${chapterNumber} de ${bookName} (${
    bookAbbrev || ""
  }),
na versão ${bibleVersion || "ACF"}.
Mantenha-se estritamente no contexto bíblico e cite versículos quando apropriado (ex.: v.3-5).
`;

  console.log(
    `📖 [ResumoCapítulo] Gerando resumo de ${bookName} ${chapterNumber}`
  );

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
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 700,
    });

    const resumo = completion.choices[0]?.message?.content?.trim();
    console.log(
      "✅ [ResumoCapítulo] Resumo gerado:",
      resumo?.slice(0, 120),
      "..."
    );

    return res.status(200).json({ resumo });
  } catch (error: any) {
    console.error(
      "❌ [ResumoCapítulo] Erro ao consultar OpenAI:",
      error?.message || error
    );
    return res.status(500).json({ error: "Erro ao gerar resumo do capítulo." });
  }
});

export default router;
