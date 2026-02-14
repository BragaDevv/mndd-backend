// api/crosswordGenerate.ts
import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { z } from "zod";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const ReqSchema = z.object({
  theme: z.string().min(2),
  size: z.number().int().min(5).max(11).default(7),
  wordsCount: z.number().int().min(5).max(25).default(10),
});

type Direction = "across" | "down";
type Entry = {
  number: number;
  direction: Direction;
  row: number;
  col: number;
  answer: string;
  clue: string;
};

// ---- helpers ----
function normalizeAnswer(s: string) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function makeEmptyGrid(size: number) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => "#"));
}

function gridToRows(grid: string[][]) {
  return grid.map((r) => r.join(""));
}

function canPlaceWord(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  dir: Direction,
) {
  const size = grid.length;
  for (let i = 0; i < word.length; i++) {
    const r = dir === "across" ? row : row + i;
    const c = dir === "across" ? col + i : col;

    if (r < 0 || c < 0 || r >= size || c >= size) return false;

    const cell = grid[r][c];
    if (cell !== "#" && cell !== word[i]) return false;
  }
  return true;
}

function placeWord(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  dir: Direction,
) {
  for (let i = 0; i < word.length; i++) {
    const r = dir === "across" ? row : row + i;
    const c = dir === "across" ? col + i : col;
    grid[r][c] = word[i];
  }
}

function findCrossPlacements(grid: string[][], word: string) {
  const size = grid.length;
  const placements: { row: number; col: number; dir: Direction; score: number }[] = [];

  // tenta cruzar letras já existentes
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = grid[r][c];
      if (cell === "#") continue;

      for (let i = 0; i < word.length; i++) {
        if (word[i] !== cell) continue;

        // across: word[i] vai ficar em (r,c) => col = c - i
        const aRow = r;
        const aCol = c - i;
        if (canPlaceWord(grid, word, aRow, aCol, "across")) {
          placements.push({ row: aRow, col: aCol, dir: "across", score: 2 });
        }

        // down: row = r - i
        const dRow = r - i;
        const dCol = c;
        if (canPlaceWord(grid, word, dRow, dCol, "down")) {
          placements.push({ row: dRow, col: dCol, dir: "down", score: 2 });
        }
      }
    }
  }

  // fallback: tenta posições livres (pontuação menor)
  if (!placements.length) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (canPlaceWord(grid, word, r, c, "across"))
          placements.push({ row: r, col: c, dir: "across", score: 1 });
        if (canPlaceWord(grid, word, r, c, "down"))
          placements.push({ row: r, col: c, dir: "down", score: 1 });
      }
    }
  }

  // ordena: primeiro os que cruzam, depois “mais central”
  const center = (size - 1) / 2;
  placements.sort((p1, p2) => {
    if (p2.score !== p1.score) return p2.score - p1.score;
    const d1 = Math.abs(p1.row - center) + Math.abs(p1.col - center);
    const d2 = Math.abs(p2.row - center) + Math.abs(p2.col - center);
    return d1 - d2;
  });

  return placements;
}

// ---- ROUTE ----
router.post("/crossword/generate", async (req: Request, res: Response) => {
  try {
    const { theme, size, wordsCount } = ReqSchema.parse(req.body);

    // 1) IA gera lista de palavras + dicas
    const prompt = `
Gere uma lista de ${wordsCount} respostas (1 palavra cada) e dicas em PT-BR para um jogo de palavras cruzadas, com nível de dificuldade médio.
Tema: "${theme}".
Regras:
- Cada "answer" deve ser UMA palavra (sem espaços), apenas letras (pode ter acento, eu normalizo depois).
- Tamanho ideal: entre 4 e 7 letras.
- Dicas claras e curtas.
- Evite nomes obscuros.
Retorne SOMENTE JSON no formato:
{
  "title": "string",
  "items": [{ "answer": "string", "clue": "string" }]
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as any;

    const title = String(parsed.title || `Cruzada: ${theme}`);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    const words = items
      .map((it: any) => ({
        answer: normalizeAnswer(it.answer),
        clue: String(it.clue || ""),
      }))
      .filter((w: any) => w.answer.length >= 3 && w.answer.length <= size);

    // 2) Monta grade
    const grid = makeEmptyGrid(size);
    const placed: Entry[] = [];

    // coloca primeiro a maior palavra no centro
    words.sort((a: any, b: any) => b.answer.length - a.answer.length);

    if (!words.length) {
      return res.status(400).json({ error: "IA não gerou palavras válidas." });
    }

    const first = words[0];
    const startRow = Math.floor(size / 2);
    const startCol = Math.max(0, Math.floor((size - first.answer.length) / 2));

    if (!canPlaceWord(grid, first.answer, startRow, startCol, "across")) {
      // fallback: topo
      if (!canPlaceWord(grid, first.answer, 0, 0, "across")) {
        return res.status(400).json({ error: "Não foi possível montar a grade (primeira palavra)." });
      }
    }

    placeWord(grid, first.answer, startRow, startCol, "across");
    placed.push({
      number: 1,
      direction: "across",
      row: startRow,
      col: startCol,
      answer: first.answer,
      clue: first.clue,
    });

    let n = 2;

    for (let wi = 1; wi < words.length; wi++) {
      const w = words[wi];
      const placements = findCrossPlacements(grid, w.answer);
      const pick = placements[0];
      if (!pick) continue;

      placeWord(grid, w.answer, pick.row, pick.col, pick.dir);
      placed.push({
        number: n++,
        direction: pick.dir,
        row: pick.row,
        col: pick.col,
        answer: w.answer,
        clue: w.clue,
      });
    }

    // 3) Retorna formato do Firestore
    res.json({
      title,
      size,
      gridRows: gridToRows(grid),
      entries: placed,
      meta: {
        theme,
        requested: { wordsCount, size },
        placedCount: placed.length,
      },
    });
  } catch (e: any) {
    console.log("❌ /crossword/generate", e);
    res.status(400).json({ error: e?.message || "Erro ao gerar cruzada." });
  }
});

export default router;
