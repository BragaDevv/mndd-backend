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

/** Heurística simples para detectar uma referência bíblica dentro de um texto.
 * Exemplos que deve pegar: "João 3:16", "1 Coríntios 13:4-7", "Sl 23:1", "Rm 8:28"
 * Não tenta validar o nome exato do livro, apenas estrutura com capítulo:verso(s).
 */
function extrairPossivelReferencia(texto: string): string | null {
  if (!texto) return null;
  // procura padrão "Palavra 3:16" com capítulo e verso(s), permite hífen de intervalo
  const refRegex = /([1-3]?\s?[A-Za-zÀ-ú\.]+)\s*\d{1,3}:\d{1,3}(?:-\d{1,3})?/g;
  const match = texto.match(refRegex);
  return match?.[0]?.trim() ?? null;
}

/** Remove aspas externas ocasionais e corta espaços */
function sanitizeOneLine(s: string): string {
  if (!s) return s;
  let t = s.trim();
  // remove aspas no começo/final (", “, ”, ‘, ’)
  t = t.replace(/^[“”"‘’']+/, "").replace(/[“”"‘’']+$/, "");
  // colapsa quebras em 1 linha
  t = t.replace(/\s*\n+\s*/g, " ");
  return t;
}

/** Garante <= 240 chars sem quebrar no meio desnecessariamente */
function clamp240(s: string): string {
  const MAX = 240;
  if (s.length <= MAX) return s;
  // tenta cortar no último ponto ou barra vertical antes do limite
  const cutAt = Math.max(s.lastIndexOf(" | ", MAX), s.lastIndexOf(". ", MAX), s.lastIndexOf(" ", MAX));
  return (cutAt > 120 ? s.slice(0, cutAt) : s.slice(0, MAX)).trim();
}

/** Monta o prompt conforme o caso */
function buildPrompt({ tema, referencia }: { tema?: string; referencia?: string }) {
  // Prioriza referência explícita; se não vier, tenta extrair de tema
  let ref = referencia?.trim();
  if (!ref && tema) {
    const tentativa = extrairPossivelReferencia(tema);
    if (tentativa) ref = tentativa;
  }

  // Monta instruções por cenário
  if (ref && tema) {
    return `
Gere a MENSAGEM (apenas o corpo) de uma notificação push cristã para o app MNDD.

Use EXATAMENTE a referência bíblica: "${ref}".
Tema para a aplicação prática: "${sanitizeOneLine(tema)}".

Regras:
- NÃO inclua o título; o app define.
- Uma única linha com:
  • trecho curto do versículo (bem resumido) + referência abreviada;
  • separador " | ";
  • frase breve aplicando ao tema;
  • 1–2 emojis apropriados.
- Máximo 240 caracteres.
- Não use aspas ao redor do texto.
Exemplo de ESTILO (não copie): O Senhor é meu pastor (Sl 23:1) | Ele guia seus passos hoje 🕊️
`;
  }

  if (ref && !tema) {
    return `
Gere a MENSAGEM (apenas o corpo) de uma notificação push cristã para o app MNDD.

Use EXATAMENTE a referência bíblica: "${ref}" como base do versículo.

Regras:
- NÃO inclua o título; o app define.
- Uma única linha com:
  • trecho curto do versículo (bem resumido) + referência abreviada;
  • separador " | ";
  • frase breve de aplicação prática;
  • 1–2 emojis apropriados.
- Máximo 240 caracteres.
- Não use aspas ao redor do texto.
`;
  }

  // Sem referência → peça que escolha um verso apropriado ao tema
  return `
Gere a MENSAGEM (apenas o corpo) de uma notificação push cristã para o app MNDD.

Tema: "${sanitizeOneLine(tema || "")}".

Regras:
- NÃO inclua o título; o app define.
- Escolha um versículo bíblico curto que combine com o tema.
- Uma única linha com:
  • trecho curto do versículo + referência abreviada;
  • separador " | ";
  • frase breve de aplicação prática;
  • 1–2 emojis apropriados.
- Máximo 240 caracteres.
- Não use aspas ao redor do texto.
`;
}

router.post("/notificacao-ia", async (req: Request, res: Response) => {
  try {
    let { tema, referencia } = req.body as {
      tema?: string;
      referencia?: string;
    };

    // Permite: só tema, só referência, ou ambos
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

    // Log
    console.log(
      `📩 [IA] Geração de notificação | tema="${tema || "-"}" | referencia="${referencia || "-"}"`
    );

    const prompt = buildPrompt({ tema, referencia });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ou "gpt-3.5-turbo" se preferir
      temperature: 0.7,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente bíblico cristão que escreve notificações curtas e impactantes para aplicativo móvel.",
        },
        { role: "user", content: prompt },
      ],
    });

    let corpo = completion.choices[0]?.message?.content ?? "";
    corpo = sanitizeOneLine(corpo);
    corpo = clamp240(corpo);

    if (!corpo) {
      throw new Error("IA não retornou conteúdo.");
    }

    const resposta = {
      // ⚠️ título com emoji da Bíblia, conforme solicitado
      titulo: "📖 Palavra de Hoje",
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
