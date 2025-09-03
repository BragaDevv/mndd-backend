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

/** Helpers de log */
const reqId = () => Math.random().toString(36).slice(2, 8);
const preview = (s: string | undefined | null, max = 180) => {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
};
const logHdr = (req: Request) => {
  const h = req.headers;
  return {
    origin: h.origin,
    "content-type": h["content-type"],
    "user-agent": h["user-agent"],
    referer: h.referer,
    host: h.host,
  };
};

function pick<T>(arr: T[], r: number) {
  return arr[Math.floor(r * arr.length)]!;
}

// --------- Função que gera o presente (reutilizada no POST e GET) ---------
async function generateGift(params: {
  name: string;
  kind: Kind;
  locale: string;
  _logId?: string; // <- para logs
}) {
  const { name, kind, locale, _logId } = params;
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
      ? `Escreva uma oração curta, afetuosa e bíblica para ${name}, em ${locale}, com 90-110 palavras no máximo, tom pastoral e linguagem simples.Use 1 exemplo de personagens da bíblia caso queira. Inclua exatamente 1 versículo com referência curta entre parênteses. Não use listas.Não use frases como: 'nesse belo dia', ou 'nesse dia ensolarado' entre outras, pois não sabemos em que horário e nem o clima que está. Termine com "Amém".`
      : `Escreva uma mensagem motivacional cristã curta para ${name}, em ${locale}, com 90-110 palavras no máximo, tom encorajador e linguagem simples.Use 1 exemplo de personagens da bíblia caso queira.Inclua exatamente 1 referência bíblica entre parênteses.Não use frases como: 'nesse belo dia', ou 'nesse dia ensolarado' entre outras, pois não sabemos em que horário e nem o clima que está. Não use listas.`;

  const fullPrompt = `${basePrompt}
Estilo: ${estilo}. Foque em ${foco}. Contexto do dia: ${today}.`;

  console.log(
    `[daily-gift:${_logId}] prompt (${locale}/${kind}) len=${
      fullPrompt.length
    } :: ${preview(fullPrompt, 220)}`
  );

  console.time(`[daily-gift:${_logId}] openai`);
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
  console.timeEnd(`[daily-gift:${_logId}] openai`);

  const text =
    resp.choices?.[0]?.message?.content?.trim() ||
    "Que seu dia seja abençoado e cheio da paz de Cristo. (Cl 3:15) 🙏";

  // logs da resposta
  const usage = (resp as any)?.usage || {};
  const finishReason = resp.choices?.[0]?.finish_reason;
  console.log(
    `[daily-gift:${_logId}] finish=${finishReason} tokens=${JSON.stringify(
      usage
    )} textPreview="${preview(text, 160)}"`
  );

  return { date: today, kind, text };
}

// ------------------------------- Rotas ------------------------------------

// POST /api/daily-gift  (usada pelo app)
router.post("/daily-gift", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  console.log(`\n[REQ ${id}] POST /api/daily-gift`);
  console.log(`[REQ ${id}] headers: ${JSON.stringify(logHdr(req))}`);

  const {
    name = "amigo(a)",
    kind = "prayer",
    locale = "pt-BR",
  } = req.body || {};
  console.log(
    `[REQ ${id}] body: ${JSON.stringify({ name, kind, locale }).slice(0, 300)}`
  );

  if (!process.env.OPENAI_API_KEY) {
    console.error(`[daily-gift:${id}] OPENAI_API_KEY ausente`);
    return res
      .status(500)
      .json({ error: "OPENAI_API_KEY ausente no servidor." });
  }

  try {
    const out = await generateGift({ name, kind, locale, _logId: id });
    console.log(
      `[RES ${id}] 200 in ${Date.now() - started}ms :: textPreview="${preview(
        out.text,
        140
      )}"`
    );
    return res.json(out);
  } catch (err: any) {
    console.error(
      `[RES ${id}] 500 in ${Date.now() - started}ms ::`,
      err?.message || err
    );
    return res.status(500).json({ error: "Falha ao gerar presente diário." });
  }
});

// GET /api/daily-gift/preview?name=Mateus&kind=prayer&locale=pt-BR  (teste rápido)
router.get("/daily-gift/preview", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  console.log(`\n[REQ ${id}] GET /api/daily-gift/preview`);
  console.log(`[REQ ${id}] headers: ${JSON.stringify(logHdr(req))}`);

  const name = (req.query.name as string) || "amigo(a)";
  const kind = (req.query.kind as Kind) || "prayer";
  const locale = (req.query.locale as string) || "pt-BR";
  console.log(
    `[REQ ${id}] query: ${JSON.stringify({ name, kind, locale }).slice(0, 300)}`
  );

  if (!process.env.OPENAI_API_KEY) {
    console.error(`[daily-gift:${id}] OPENAI_API_KEY ausente`);
    return res
      .status(500)
      .json({ error: "OPENAI_API_KEY ausente no servidor." });
  }

  try {
    const out = await generateGift({ name, kind, locale, _logId: id });
    console.log(
      `[RES ${id}] 200 in ${Date.now() - started}ms :: textPreview="${preview(
        out.text,
        140
      )}"`
    );
    return res.json(out);
  } catch (err: any) {
    console.error(
      `[RES ${id}] 500 in ${Date.now() - started}ms ::`,
      err?.message || err
    );
    return res.status(500).json({ error: "Falha ao gerar preview." });
  }
});

export default router;
