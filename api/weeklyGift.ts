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
// ✅ Define o fuso padrão para TODAS as instâncias do dayjs
dayjsBase.tz.setDefault(TZ);
// Helper para "agora" já no TZ definido
const now = () => dayjsBase();

const router = express.Router();

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ================= utils ================= */
type Kind = "motivation";

const reqId = () => Math.random().toString(36).slice(2, 8);
const preview = (s?: string | null, max = 180) =>
  !s ? "" : s.length > max ? s.slice(0, max) + "…" : s;

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

/** Segunda-feira (YYYY-MM-DD) da semana corrente no TZ configurado */
function currentMondayISO(): string {
  const d = now();
  const dow = d.day(); // 0=dom, 1=seg, ...
  const offset = dow === 0 ? -6 : 1 - dow; // leva até a segunda
  return d.add(offset, "day").format("YYYY-MM-DD");
}

function isMondayNow(): boolean {
  return now().day() === 1;
}

/** Próxima segunda em ISO UTC (sempre parseável no front) */
function nextMondayISO(): string {
  const d = now();
  const add = ((8 - d.day()) % 7) || 7;
  return d.add(add, "day").startOf("day").toDate().toISOString();
}

/* =============== core generator =============== */
async function generateWeeklyGift(params: {
  name: string;
  locale: string;
  _logId?: string;
}) {
  const { name, locale, _logId } = params;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY ausente no servidor.");
  }

  // seed por: segunda da semana + nome + "motivation"
  const monday = currentMondayISO();
  const rng = seedrandom(`${monday}|${name}|motivation`);

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

  // ⚠️ Formato final exigido:
  // <Ref curta> — "mensagem motivacional (90–110 palavras, cite ao menos um versículo)"
  // — Ministério Nascido de Deus (MNDD)
  const prompt = `
Escreva em ${locale} uma MENSAGEM MOTIVACIONAL CRISTÃ para iniciar a semana de ${name}.
Regras de FORMATAÇÃO (siga à risca):
1) Comece com UMA referência bíblica curta (ex.: Rm 8:31, Js 1:9, Fp 4:13), referência e versículo entre aspas.
2) Depois da referência, escreva: espaço, travessão (—) e espaço.
3) Em seguida, escreva toda a mensagem.
4) A mensagem deve citar ao menos UM versículo (pode mencionar o texto brevemente e/ou a referência dentro do conteúdo).
5) 90–110 palavras. Linguagem simples, prática e encorajadora. Traga um EXEMPLO bíblico de fé/perseverança (Davi, Ester, Paulo, Noé, José, etc).
6) NÃO use listas, emojis ou menções a clima/horário.
7) Depois, QUEBRE linha e escreva exatamente: — Ministério Nascido de Deus (MNDD)

Tom: ${tom}. Foque em ${foco}. Contexto: segunda-feira, início de semana.
`.trim();

  console.log(
    `[weekly-gift:${_logId}] prompt len=${prompt.length} :: ${preview(prompt, 220)}`
  );

  console.time(`[weekly-gift:${_logId}] openai`);
  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente cristão do Ministério Nascido de Deus (MNDD). Responda de modo bíblico, acolhedor e natural. Obedeça estritamente ao formato pedido.",
      },
      { role: "user", content: prompt },
    ],
  });
  console.timeEnd(`[weekly-gift:${_logId}] openai`);

  const text =
    resp.choices?.[0]?.message?.content?.trim() ||
    `Fp 4:13 — "Comece a semana com coragem em Cristo; como Paulo, persevere nas lutas, lembrando que a força vem do Senhor. Dê um passo de cada vez e mantenha o coração firmado na esperança do Evangelho. O Deus que começou a boa obra em você é fiel para completar. Confie, ore e avance; Ele cuida dos detalhes e sustenta seus passos (Fp 4:13)."
— Ministério Nascido de Deus (MNDD)`;

  const usage = (resp as any)?.usage || {};
  const finishReason = resp.choices?.[0]?.finish_reason;
  console.log(
    `[weekly-gift:${_logId}] finish=${finishReason} tokens=${JSON.stringify(
      usage
    )} textPreview="${preview(text, 160)}"`
  );

  return {
    week_monday: monday,
    kind: "motivation" as Kind,
    text, // formato: <Ref> — "conteúdo"\n— MNDD
  };
}

/* =============== routes =============== */

/**
 * POST /api/weekly-gift
 * Usado pelo app. Só libera NAS SEGUNDAS-FEIRAS (TZ America/Sao_Paulo).
 * Body: { name?: string, locale?: string }
 */
router.post("/weekly-gift", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  console.log(`\n[REQ ${id}] POST /api/weekly-gift`);
  console.log(`[REQ ${id}] headers: ${JSON.stringify(logHdr(req))}`);

  const { name = "amigo(a)", locale = "pt-BR" } = req.body || {};
  console.log(`[REQ ${id}] body: ${JSON.stringify({ name, locale })}`);

  try {
    if (!isMondayNow()) {
      const nextAt = nextMondayISO();
      console.log(`[RES ${id}] 200 not-monday -> next=${nextAt}`);
      return res.json({
        available: false,
        nextAvailableAt: nextAt,
        reason: "Disponível apenas às segundas-feiras.",
      });
    }

    const out = await generateWeeklyGift({ name, locale, _logId: id });
    console.log(
      `[RES ${id}] 200 in ${Date.now() - started}ms :: text="${preview(
        out.text,
        140
      )}"`
    );
    return res.json({ available: true, ...out });
  } catch (err: any) {
    console.error(`[RES ${id}] 500 ::`, err?.message || err);
    return res
      .status(500)
      .json({ error: "Falha ao gerar presente semanal." });
  }
});

/**
 * GET /api/weekly-gift/preview?name=Mateus&locale=pt-BR&force=true
 * Gera uma amostra. Use force=true para ignorar a regra de segunda.
 */
router.get("/weekly-gift/preview", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  console.log(`\n[REQ ${id}] GET /api/weekly-gift/preview`);
  console.log(`[REQ ${id}] headers: ${JSON.stringify(logHdr(req))}`);

  const name = (req.query.name as string) || "amigo(a)";
  const locale = (req.query.locale as string) || "pt-BR";
  const force = (req.query.force as string) === "true";

  try {
    if (!force && !isMondayNow()) {
      const nextAt = nextMondayISO();
      console.log(`[RES ${id}] 200 preview not-monday -> next=${nextAt}`);
      return res.json({
        available: false,
        nextAvailableAt: nextAt,
        reason:
          "Disponível apenas às segundas-feiras. Use ?force=true para teste.",
      });
    }

    const out = await generateWeeklyGift({ name, locale, _logId: id });
    console.log(
      `[RES ${id}] 200 in ${Date.now() - started}ms :: text="${preview(
        out.text,
        140
      )}"`
    );
    return res.json({ available: true, ...out });
  } catch (err: any) {
    console.error(`[RES ${id}] 500 ::`, err?.message || err);
    return res.status(500).json({ error: "Falha ao gerar preview." });
  }
});

export default router;
