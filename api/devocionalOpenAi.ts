// devocionalOpenAi.ts
import { Request, Response } from "express";
import fetch from "node-fetch";
import { htmlToText } from "html-to-text";
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const devocionalIaHandler = async (req: Request, res: Response) => {
  try {
    const response = await fetch("https://ministeriospaodiario.com.br/devocional");
    const html = await response.text();

    const textoLimpo = htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: "a", format: "skip" },
        { selector: "img", format: "skip" },
      ],
    });

    const textoLimitado = textoLimpo.slice(0, 4000);

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente devocional cristão. Com base no conteúdo fornecido, extraia:\n1. Um título\n2. O versículo central\n3. Um devocional em até 4 parágrafos curtos.\nResponda no formato JSON com: { titulo, referencia, paragrafos }",
        },
        {
          role: "user",
          content: textoLimitado,
        },
      ],
      temperature: 0.7,
    });

    const resultado = completion.choices[0].message?.content || "";
    const json = JSON.parse(resultado);

    return res.status(200).json({ devocional: json });
  } catch (error: any) {
    console.error("❌ Erro ao gerar devocional com IA:", error);
    return res.status(500).json({ erro: "Erro ao gerar devocional com IA" });
  }
};
