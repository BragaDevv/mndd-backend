// devocionalIa.ts
import { Request, Response } from "express";
import fetch from "node-fetch";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export const devocionalIaHandler = async (req: Request, res: Response) => {
  try {
    const url = "https://ministeriospaodiario.com.br/devocional";
    const html = await fetch(url).then((r) => r.text());

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-16k", // ou "gpt-4" se tiver acesso
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente cristão que extrai devocionais de páginas HTML. Analise o HTML e extraia as informações em formato JSON.",
        },
        {
          role: "user",
          content: `HTML da página:\n\n${html}\n\nExtraia:
- título
- data
- referência bíblica
- parágrafos do texto
- resumo de 1 frase

Responda em JSON.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const resposta = completion.choices[0].message?.content;
    if (!resposta || !resposta.includes("{")) {
      return res.status(500).json({ error: "Resposta inesperada da IA." });
    }

    const jsonInicio = resposta.indexOf("{");
    const json = resposta.slice(jsonInicio);

    const resultado = JSON.parse(json);
    return res.json({ devocional: resultado });
  } catch (error) {
    console.error("❌ Erro ao buscar devocional com IA:", error);
    return res.status(500).json({ error: "Erro ao buscar devocional com IA." });
  }
};
