import { Router, Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("✅ Rota /notificacao-ia configurada.");

type TipoNotificacao = "biblico" | "casual";

/** Detecta possível referência bíblica no texto */
function extrairPossivelReferencia(texto: string): string | null {
  if (!texto) return null;

  const refRegex = /([1-3]?\s?[A-Za-zÀ-ú\.]+)\s*\d{1,3}:\d{1,3}(?:-\d{1,3})?/g;

  const match = texto.match(refRegex);
  return match?.[0]?.trim() ?? null;
}

/** Remove aspas externas e normaliza em uma linha */
function sanitizeOneLine(s: string): string {
  if (!s) return s;
  let t = s.trim();
  t = t.replace(/^[“”"‘’']+/, "").replace(/[“”"‘’']+$/, "");
  t = t.replace(/\s*\n+\s*/g, " ");
  return t;
}

/** Corta texto com limite */
function clampText(s: string, max: number): string {
  if (!s) return s;
  if (s.length <= max) return s;

  const cutAt = Math.max(
    s.lastIndexOf(" | ", max),
    s.lastIndexOf(". ", max),
    s.lastIndexOf(" ", max),
  );

  return (cutAt > Math.floor(max * 0.5) ? s.slice(0, cutAt) : s.slice(0, max))
    .trim()
    .replace(/[.,;:\-–—]$/, "");
}

function sanitizeTitle(s: string): string {
  return clampText(sanitizeOneLine(s), 80);
}

function sanitizeBody(s: string): string {
  return clampText(sanitizeOneLine(s), 240);
}

/** Fallback automático se o front não enviar tipo */
function detectarTemaBiblico({
  tema,
  referencia,
}: {
  tema?: string;
  referencia?: string;
}): boolean {
  if (referencia?.trim()) return true;

  const texto = `${tema || ""}`.toLowerCase();

  if (extrairPossivelReferencia(texto)) return true;

  const palavrasBiblicas = [
    "deus",
    "jesus",
    "cristo",
    "espírito santo",
    "espirito santo",
    "oração",
    "oracao",
    "fé",
    "fe",
    "evangelho",
    "salvação",
    "salvacao",
    "bíblia",
    "biblia",
    "versículo",
    "versiculo",
    "palavra",
    "devocional",
    "culto",
    "igreja",
    "graça",
    "graca",
    "louvor",
    "adoração",
    "adoracao",
    "promessa",
    "salmo",
    "salmos",
    "provérbios",
    "proverbios",
    "joão",
    "joao",
    "romanos",
    "mateus",
    "coríntios",
    "corintios",
  ];

  return palavrasBiblicas.some((p) => texto.includes(p));
}

/** Prompt bíblico */
function buildPromptBiblico({
  tema,
  referencia,
}: {
  tema?: string;
  referencia?: string;
}) {
  let ref = referencia?.trim();

  if (!ref && tema) {
    const tentativa = extrairPossivelReferencia(tema);
    if (tentativa) ref = tentativa;
  }

  if (ref && tema) {
    return `
Gere um JSON com "titulo" e "corpo" para uma notificação push cristã do app MNDD.

Use EXATAMENTE a referência bíblica: "${ref}".
Tema para a aplicação prática: "${sanitizeOneLine(tema)}".

Regras do título:
- Curto, impactante e espiritual.
- Máximo 60 caracteres.
- Pode usar 1 emoji apropriado.

Regras do corpo:
- Uma única linha.
- Deve conter:
  • trecho curto do versículo + referência abreviada;
  • separador " | ";
  • frase breve aplicando ao tema;
  • 1–2 emojis apropriados.
- Máximo 240 caracteres.
- Não use aspas.

Responda SOMENTE em JSON válido:
{
  "titulo": "...",
  "corpo": "..."
}
`;
  }

  if (ref && !tema) {
    return `
Gere um JSON com "titulo" e "corpo" para uma notificação push cristã do app MNDD.

Use EXATAMENTE a referência bíblica: "${ref}" como base.

Regras do título:
- Curto, impactante e espiritual.
- Máximo 60 caracteres.
- Pode usar 1 emoji apropriado.

Regras do corpo:
- Uma única linha.
- Deve conter:
  • trecho curto do versículo + referência abreviada;
  • separador " | ";
  • frase breve de aplicação prática;
  • 1–2 emojis apropriados.
- Máximo 240 caracteres.
- Não use aspas.

Responda SOMENTE em JSON válido:
{
  "titulo": "...",
  "corpo": "..."
}
`;
  }

  return `
Gere um JSON com "titulo" e "corpo" para uma notificação push cristã do app MNDD.

Tema: "${sanitizeOneLine(tema || "")}"

Regras do título:
- Curto, impactante e espiritual.
- Máximo 60 caracteres.
- Pode usar 1 emoji apropriado.

Regras do corpo:
- Uma única linha.
- Escolha um versículo bíblico curto que combine com o tema.
- Deve conter:
  • trecho curto do versículo + referência abreviada;
  • separador " | ";
  • frase breve de aplicação prática;
  • 1–2 emojis apropriados.
- Máximo 240 caracteres.
- Não use aspas.

Responda SOMENTE em JSON válido:
{
  "titulo": "...",
  "corpo": "..."
}
`;
}

/** Prompt casual */
function buildPromptCasual({ tema }: { tema?: string }) {
  return `
Gere um JSON com "titulo" e "corpo" para uma notificação push do app MNDD.

Tema principal: "${sanitizeOneLine(tema || "")}"

Importante:
- Esta notificação NÃO é bíblica.
- Não cite versículos.
- Não use linguagem devocional.
- O tom deve ser moderno, envolvente, amigável e clicável.
- Pode ser sobre aviso, novidade, atualização do app, enquete, lembrete ou comunicado geral.

Regras do título:
- Curto, forte e natural.
- Máximo 60 caracteres.
- Pode usar 1 emoji coerente.

Regras do corpo:
- Uma única linha.
- Máximo 180 caracteres.
- Convide a pessoa a abrir ou conferir no app.
- Pode usar 1–2 emojis coerentes.
- Não use aspas.

Exemplos de tom:
- "📢 Novo aviso"
- "🚀 Novidade no app"
- "📊 Enquete nova"
- "⬆️ Atualize seu app"

Responda SOMENTE em JSON válido:
{
  "titulo": "...",
  "corpo": "..."
}
`;
}

/** Extrai JSON mesmo se vier com texto extra */
function parseJsonFromText(
  text: string,
): { titulo?: string; corpo?: string } | null {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallbackTituloCasual(tema?: string): string {
  const t = (tema || "").toLowerCase();

  if (t.includes("atual")) return "⬆️ Atualize seu app";
  if (t.includes("aviso")) return "📢 Novo aviso";
  if (t.includes("enquete")) return "📊 Enquete nova";
  if (t.includes("novidade")) return "🚀 Novidade no app";

  return "✨ Confira no app";
}

function fallbackCorpoCasual(tema?: string): string {
  const t = sanitizeOneLine(tema || "");

  if (!t) {
    return "Tem novidade esperando por você no app. Abra agora para conferir ✨";
  }

  return `Tem novidade sobre ${t} no app. Toque para conferir agora 👀`;
}

router.post("/notificacao-ia", async (req: Request, res: Response) => {
  try {
    let { tema, referencia, tipo } = req.body as {
      tema?: string;
      referencia?: string;
      tipo?: TipoNotificacao;
    };

    if (
      (!tema || typeof tema !== "string" || !tema.trim()) &&
      (!referencia || typeof referencia !== "string" || !referencia.trim())
    ) {
      return res.status(400).json({
        error:
          "Envie pelo menos 'tema' OU 'referencia' (ex.: { tema: 'Pertencimento a Deus' } ou { referencia: 'João 3:16' } ou ambos).",
      });
    }

    tema = typeof tema === "string" ? tema.trim() : undefined;
    referencia = typeof referencia === "string" ? referencia.trim() : undefined;

    const tipoFinal: TipoNotificacao =
      tipo === "biblico" || tipo === "casual"
        ? tipo
        : detectarTemaBiblico({ tema, referencia })
          ? "biblico"
          : "casual";

    console.log(
      `📩 [IA] Geração de notificação | tipo="${tipoFinal}" | tema="${tema || "-"}" | referencia="${referencia || "-"}"`,
    );

    const prompt =
      tipoFinal === "biblico"
        ? buildPromptBiblico({ tema, referencia })
        : buildPromptCasual({ tema });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: tipoFinal === "biblico" ? 0.7 : 0.85,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            tipoFinal === "biblico"
              ? "Você é um assistente bíblico cristão que escreve notificações curtas, impactantes e bem formatadas para aplicativo móvel. Sempre responda em JSON válido."
              : "Você é um assistente de engajamento e produto que escreve notificações curtas, claras e atrativas para aplicativo móvel. Sempre responda em JSON válido.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = parseJsonFromText(raw);

    let titulo = sanitizeTitle(parsed?.titulo || "");
    let corpo = sanitizeBody(parsed?.corpo || "");

    if (!corpo) {
      if (tipoFinal === "biblico") {
        titulo = titulo || "📖 Palavra de Hoje";
        corpo =
          "Deus tem uma palavra para o seu coração hoje. Abra o app e receba essa mensagem 🙏";
      } else {
        titulo = titulo || fallbackTituloCasual(tema);
        corpo = sanitizeBody(fallbackCorpoCasual(tema));
      }
    }

    if (!titulo) {
      titulo =
        tipoFinal === "biblico"
          ? "📖 Palavra de Hoje"
          : fallbackTituloCasual(tema);
    }

    const resposta = {
      titulo,
      corpo,
      tipo: tipoFinal,
    };

    console.log("✅ [IA] Notificação gerada:", resposta);
    return res.json(resposta);
  } catch (err: any) {
    console.error("❌ Erro IA:", err?.message || err);
    return res.status(500).json({ error: "Erro ao gerar notificação IA." });
  }
});

export default router;
