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

// sanitiza e extrai primeiro nome
function firstName(raw?: string | null) {
  if (!raw) return "amigo(a)";
  const first = String(raw).trim().split(/\s+/)[0].slice(0, 30);
  const safe = first.replace(/[^\p{L}\p{M}\-'.]/gu, "");
  if (!safe) return "amigo(a)";
  return safe.charAt(0).toUpperCase() + safe.slice(1);
}

/* =============== core generator =============== */
async function generateWeeklyGift(params: {
  uid?: string | null; // preferível
  name: string;
  locale: string;
  _logId?: string;
}) {
  const { uid, name, locale, _logId } = params;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY ausente no servidor.");
  }

  const fname = firstName(name);
  const monday = currentMondayISO();
  // seed estável por semana + usuário (UID > nome)
  const seedKey = `${monday}|${uid || fname}|motivation`;
  const rng = seedrandom(seedKey);

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
  const herois = ["Davi", "Ester", "Paulo", "Noé", "José", "Débora", "Rute"];
  const recursos = [
    "uma metáfora leve de caminhada",
    "uma imagem de semeadura e colheita",
    "um paralelo com tempestades e abrigo",
    "um lembrete sobre portas que Deus abre",
  ];

  const tom = pick(tons, rng());
  const foco = pick(focos, rng());
  const heroi = pick(herois, rng());
  const recurso = pick(recursos, rng());

  // Formato final (3 linhas):
  // L1: Olá, <Nome>!
  // L2: <Ref curta> — "mensagem 90–110 palavras..."
  // L3: — Ministério Nascido de Deus (MNDD)
  const prompt = `
Escreva em ${locale} uma MENSAGEM MOTIVACIONAL CRISTÃ personalizada para ${fname}.

Formato EXATO (obrigatório):
Linha 1: Olá, ${fname}!
Linha 2: <ref bíblica curta> — "conteúdo"
Linha 3: Ministério Nascido de Deus (MNDD)

Regras do conteúdo da Linha 2:
- 90 a 110 palavras.
- Linguagem simples, prática e encorajadora.
- Cite pelo menos UM versículo (mencione brevemente o texto e/ou a referência).
- Use ${heroi} como exemplo bíblico.
- Tom ${tom}, com foco em ${foco}; use ${recurso} se couber naturalmente.
- Não use listas, emojis, clima ou horário.
- Não repita a saudação; ela fica SOMENTE na Linha 1.
`.trim();

  console.log(
    `[weekly-gift:${_logId}] seed="${seedKey}" prompt len=${prompt.length} :: ${preview(
      prompt,
      220
    )}`
  );

  console.time(`[weekly-gift:${_logId}] openai`);
  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.9,
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente cristão do Ministério Nascido de Deus (MNDD). Responda de modo bíblico, acolhedor e natural. Obedeça ESTRITAMENTE ao formato (3 linhas).",
      },
      { role: "user", content: prompt },
    ],
  });
  console.timeEnd(`[weekly-gift:${_logId}] openai`);

  let text =
    resp.choices?.[0]?.message?.content?.trim() ??
    `Olá, ${fname}!
Fp 4:13 — "Tudo posso naquele que me fortalece." Comece a semana com coragem em Cristo; como Paulo, persevere nas lutas, lembrando que a força vem do Senhor.
— Ministério Nascido de Deus (MNDD)`;

  // Normalizações
  text = text
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/i, "")
    .trim();

  // Garante 3 linhas
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3 || !/^Olá, /.test(lines[0])) {
    const body =
      lines.find((l) => /—/.test(l)) ??
      `Fp 4:13 — "Tudo posso naquele que me fortalece."`;
    text = `Olá, ${fname}!\n${body}\n— Ministério Nascido de Deus (MNDD)`;
  }

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
    text,
  };
}

/* =============== routes =============== */

/**
 * POST /api/weekly-gift
 * Agora SEM validação de dia: disponível todos os dias.
 * Body: { uid?: string, name?: string, locale?: string }
 */
router.post("/weekly-gift", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  console.log(`\n[REQ ${id}] POST /api/weekly-gift`);
  console.log(`[REQ ${id}] headers: ${JSON.stringify(logHdr(req))}`);

  const { uid = null, name = "amigo(a)", locale = "pt-BR" } = req.body || {};
  console.log(`[REQ ${id}] body: ${JSON.stringify({ uid, name, locale })}`);

  try {
    const out = await generateWeeklyGift({ uid, name, locale, _logId: id });
    console.log(
      `[RES ${id}] 200 in ${Date.now() - started}ms :: text="${preview(
        out.text,
        140
      )}"`
    );
    return res.json({ available: true, ...out });
  } catch (err: any) {
    console.error(`[RES ${id}] 500 ::`, err?.message || err);
    return res.status(500).json({ error: "Falha ao gerar presente." });
  }
});

/**
 * GET /api/weekly-gift/preview?uid=123&name=Mateus&locale=pt-BR
 * Também sempre disponível (sem validação de dia).
 */
router.get("/weekly-gift/preview", async (req: Request, res: Response) => {
  const id = reqId();
  const started = Date.now();
  console.log(`\n[REQ ${id}] GET /api/weekly-gift/preview`);
  console.log(`[REQ ${id}] headers: ${JSON.stringify(logHdr(req))}`);

  const uid = (req.query.uid as string) || null;
  const name = (req.query.name as string) || "amigo(a)";
  const locale = (req.query.locale as string) || "pt-BR";

  try {
    const out = await generateWeeklyGift({ uid, name, locale, _logId: id });
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
