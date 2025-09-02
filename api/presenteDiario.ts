// api/presenteDiario.ts
import express, { Request, Response } from "express";
import dayjs from "dayjs";
import seedrandom from "seedrandom";
import OpenAI from "openai";

const router = express.Router();

// Modelo via env (opcional), padrão gpt-4o-mini
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Cliente OpenAI (usa OPENAI_API_KEY do .env)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // <- atenção ao camelCase
});

type Kind = "prayer" | "motivation";

function pick<T>(arr: T[], r: number) {
  return arr[Math.floor(r * arr.length)]!;
}

// --------- Função que gera o presente (reutilizada no POST e GET) ---------
async function generateGift(params: { name: string; kind: Kind; locale: string }) {
  const { name, kind, locale } = params;
  const today = dayjs().format("YYYY-MM-DD");

  const rng = seedrandom(`${today}|${name}|${kind}`);

  const estilos = [
    "tom poético leve",
    "tom direto e prático",
    "tom de carinho pastoral",
    "tom contemplativo",
    "tom esperançoso",
  ];
  const focos = [
    "esperança",
    "coragem",
    "descanso em Deus",
    "gratidão",
    "perseverança",
  ];
  const estilo = pick(estilos, rng());
  const foco = pick(focos, rng());

  const basePrompt =
    kind === "prayer"
      ? `Escreva uma oração curta, afetuosa e bíblica para ${name}, em ${locale}, com 90-120 palavras, tom pastoral e linguagem simples. Inclua exatamente 1 versículo com referência curta. Não use listas. Termine com "Amém".`
      : `Escreva uma mensagem motivacional cristã curta para ${name}, em ${locale}, com 80-120 palavras, tom encorajador e linguagem simples. Inclua exatamente 1 referência bíblica entre parênteses. Não use listas.`;

  const fullPrompt = `${basePrompt}
Estilo: ${estilo}. Foque em ${foco}. Contexto do dia: ${today}.`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente cristão do Ministério Nascido de Deus (MNDD). Responda de modo bíblico, breve, acolhedor e natural.",
      },
      { role: "user", content: fullPrompt },
    ],
  });

  const text =
    resp.choices?.[0]?.message?.content?.trim() ||
    "Que seu dia seja abençoado e cheio da paz de Cristo. (Cl 3:15) 🙏";

  return { date: today, kind, text };
}

// ------------------------------- Rotas ------------------------------------

// POST /api/daily-gift  (usada pelo app)
router.post("/daily-gift", async (req: Request, res: Response) => {
  const { name = "amigo(a)", kind = "prayer", locale = "pt-BR" } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY ausente no servidor." });
  }

  try {
    const out = await generateGift({ name, kind, locale });
    return res.json(out);
  } catch (err: any) {
    console.error("[daily-gift] erro:", err?.message || err);
    return res.status(500).json({ error: "Falha ao gerar presente diário." });
  }
});

// GET /api/daily-gift/preview?name=Mateus&kind=prayer&locale=pt-BR  (teste rápido)
router.get("/daily-gift/preview", async (req: Request, res: Response) => {
  const name = (req.query.name as string) || "amigo(a)";
  const kind = (req.query.kind as Kind) || "prayer";
  const locale = (req.query.locale as string) || "pt-BR";

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY ausente no servidor." });
  }

  try {
    const out = await generateGift({ name, kind, locale });
    return res.json(out);
  } catch (err: any) {
    console.error("[daily-gift/preview] erro:", err?.message || err);
    return res.status(500).json({ error: "Falha ao gerar preview." });
  }
});

export default router;
