import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Log ao inicializar
console.log("✅ Rota /notificacao-ia configurada.");

// Função que monta o prompt
function buildPrompt(tema: string) {
  return `
Gere uma notificação push cristã para o aplicativo MNDD com o tema: "${tema}".

Regras:
- TÍTULO FIXO: "Palavra de Hoje"
- Responda apenas o CORPO, com:
  • 1 versículo bíblico curto (uma linha) + a referência abreviada;
  • 1 frase breve de aplicação prática;
  • 1–2 emojis relevantes.
- Máximo: 240 caracteres.
- Não inclua o título. Não use aspas no começo/fim.
Exemplo de estilo: O Senhor é o meu pastor (Sl 23:1) | Confie hoje na provisão de Deus! 🕊️
`;
}

router.post("/notificacao-ia", async (req: Request, res: Response) => {
  const { tema } = req.body;

  if (!tema || typeof tema !== "string") {
    return res.status(400).json({ error: "Campo 'tema' é obrigatório." });
  }

  try {
    console.log(`📩 [IA] Gerando notificação para tema: ${tema}`);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // pode trocar para "gpt-4o-mini" se disponível
      temperature: 0.7,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: "Você é um assistente bíblico cristão que escreve notificações curtas para app.",
        },
        {
          role: "user",
          content: buildPrompt(tema),
        },
      ],
    });

    const corpo = completion.choices[0]?.message?.content?.trim();

    if (!corpo) {
      throw new Error("IA não retornou conteúdo.");
    }

    const resposta = {
      titulo: "Palavra de Hoje",
      corpo,
    };

    console.log("✅ [IA] Notificação gerada:", resposta);

    return res.json(resposta);
  } catch (err: any) {
    console.error("❌ Erro IA:", err?.message || err);
    return res.status(500).json({ error: "Erro ao gerar notificação IA." });
  }
});

export default router;
