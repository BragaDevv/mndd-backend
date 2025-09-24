// api/weeklyGift.ts
import express, { Request, Response } from "express";
import dayjsBase from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";
import seedrandom from "seedrandom";
import OpenAI from "openai";

dayjsBase.extend(utc);
dayjsBase.extend(tz);

const TZ = "America/Sao_Paulo";
dayjsBase.tz.setDefault(TZ);
const now = () => dayjsBase();

const router = express.Router();

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Kind = "motivation";
const reqId = () => Math.random().toString(36).slice(2, 8);
const preview = (s?: string | null, max = 180) =>
  !s ? "" : s.length > max ? s.slice(0, max) + "…" : s;

// Segunda atual em ISO local (YYYY-MM-DD)
function todayISO(): string {
  return now().format("YYYY-MM-DD");
}

function pick<T>(arr: T[], r: number) {
  return arr[Math.floor(r * arr.length)]!;
}

async function generateGift(params: {
  uid?: string | null;
  name: string;
  locale: string;
  _logId?: string;
}) {
  const { uid, name, locale, _logId } = params;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY ausente no servidor.");
  }

  // 🔒 Semente diária por usuário: mesmo usuário recebe uma msg estável por dia; usuários diferentes recebem diferentes entre si.
  const rng = seedrandom(`${todayISO()}|${uid ?? "anon"}|${name}|motivation`);

  const tons = [
    "encorajador e terno",
    "direto e inspirador",
    "pastoral e acolhedor",
    "contemplativo e firme",
    "esperançoso e vibrante",
  ];
  const focos = [
    "perseverança na fé",
    "coragem em Cristo",
    "esperança ativa",
    "gratidão e constância",
    "descanso no cuidado de Deus",
  ];
  const tom = pick(tons, rng());
  const foco = pick(focos, rng());

  // ⚠️ FORMATO EXATO: 5 LINHAS
  // 1) Saudação curta com o nome (ex.: "Olá, Mateus!" ou "Paz, Mateus!"),
  // 2) Referência bíblica CURTA (ex.: "Rm 8:31") — sem aspas,
  // 3) Texto do versículo correspondente ENTRE aspas (“ ”),
  // 4) Mensagem devocional (80–110 palavras), simples, prática, cite ao menos 1 personagem bíblico,
  // 5) Exatamente: — Ministério Nascido de Deus (MNDD)
  // Proibições: sem emojis, sem listas/bullets, sem cabeçalhos extras. Apenas essas 5 linhas.
  const prompt = `
Escreva em ${locale} uma mensagem cristã em 5 LINHAS EXATAS para ${name}.

Regras obrigatórias (siga à risca):
1) Primeira linha: apenas a SAUDAÇÃO curta com o nome. Exemplos: "Olá, ${name}!" ou "Paz, ${name}!" (1 frase curta).
2) Segunda linha: apenas a REFERÊNCIA bíblica curta (ex.: "Rm 8:31"). Não inclua aspas.
3) Terceira linha: o TEXTO do versículo correspondente ENTRE aspas (use “ ”).
4) Quarta linha: CONTEÚDO devocional com 80–110 palavras, linguagem simples e encorajadora. Traga uma breve menção a um personagem bíblico (Davi, Ester, Paulo, Noé, José etc.). Foque em ${foco}. Tom ${tom}. Não use listas, nem emojis.
5) Quinta linha: escreva exatamente "— Ministério Nascido de Deus (MNDD)".

Não acrescente nada além dessas 5 linhas e das quebras de linha.
`.trim();

  console.log(`[weekly-gift:${_logId}] prompt len=${prompt.length} :: ${preview(prompt, 220)}`);

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente cristão do Ministério Nascido de Deus (MNDD). Siga exatamente o formato pedido: 5 linhas, nada além.",
      },
      { role: "user", content: prompt },
    ],
  });

  const text =
    resp.choices?.[0]?.message?.content?.trim() ||
    [
      `Olá, ${name}!`,
      `Fp 4:13`,
      `“Tudo posso naquele que me fortalece.”`,
      `Comece o dia lembrando que, como Paulo, sua força vem de Cristo. Quando os desafios aparecerem, peça sabedoria em oração e avance um passo de cada vez. Deus usa processos para amadurecer a fé; mesmo nas lutas, Ele sustenta, guia e renova a esperança. Confie, trabalhe com diligência e mantenha o coração firme na Palavra: o Senhor é fiel para completar a boa obra que começou em você.`,
      `— Ministério Nascido de Deus (MNDD)`,
    ].join("\n");

  return {
    date: todayISO(),
    kind: "motivation" as Kind,
    text, // 5 linhas, separadas por "\n"
  };
}

/** POST /api/weekly-gift  (sem validação de dia) */
router.post("/weekly-gift", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  console.log(`\n[REQ ${id}] POST /api/weekly-gift`);
  console.log(`[REQ ${id}] body: ${JSON.stringify(req.body || {})}`);

  const { uid = null, name = "amigo(a)", locale = "pt-BR" } = req.body || {};
  try {
    const out = await generateGift({ uid, name, locale, _logId: id });
    console.log(
      `[RES ${id}] 200 in ${Date.now() - started}ms :: text="${preview(out.text, 160)}"`
    );
    return res.json({ ok: true, ...out });
  } catch (err: any) {
    console.error(`[RES ${id}] 500 ::`, err?.message || err);
    return res.status(500).json({ error: "Falha ao gerar presente." });
  }
});

/** GET /api/weekly-gift/preview?uid=123&name=Mateus&locale=pt-BR */
router.get("/weekly-gift/preview", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  const uid = (req.query.uid as string) || null;
  const name = (req.query.name as string) || "amigo(a)";
  const locale = (req.query.locale as string) || "pt-BR";

  try {
    const out = await generateGift({ uid, name, locale, _logId: id });
    console.log(
      `[RES ${id}] 200 in ${Date.now() - started}ms :: text="${preview(out.text, 160)}"`
    );
    return res.json({ ok: true, ...out });
  } catch (err: any) {
    console.error(`[RES ${id}] 500 ::`, err?.message || err);
    return res.status(500).json({ error: "Falha ao gerar preview." });
  }
});

export default router;
