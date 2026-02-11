import { Router, Request, Response } from "express";
import admin from "firebase-admin";

const router = Router();

/**
 * 🔐 Proteção simples por "OWNER_UID"
 * - só permite se o usuário autenticado for o dono
 * - o app envia Firebase ID Token no header Authorization: Bearer <token>
 */
async function requireOwner(req: Request) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    const err: any = new Error("Missing Bearer token");
    err.status = 401;
    throw err;
  }

  const decoded = await admin.auth().verifyIdToken(token);
  const ownerUid = process.env.OWNER_UID;

  if (!ownerUid) {
    const err: any = new Error("OWNER_UID não configurado no backend");
    err.status = 500;
    throw err;
  }

  if (decoded.uid !== ownerUid) {
    const err: any = new Error("Not allowed");
    err.status = 403;
    throw err;
  }

  return decoded;
}

router.post("/admin/crossword/seed", async (req: Request, res: Response) => {
  try {
    await requireOwner(req);

    const weekId = String(req.body?.weekId ?? "TESTE-001");
    const title = String(req.body?.title ?? "Cruzada – Evangelhos");

const gridRows = [
  "#######",
  "##....#",
  "##.####",
  "##...##",
  "#...###",
  "#....##",
  "#.#####",
];


    const entries = [
      { number: 1, direction: "across", row: 1, col: 2, answer: "JOAO",  clue: "Apóstolo e autor de um Evangelho" },
      { number: 1, direction: "down",   row: 1, col: 2, answer: "JESUS", clue: "Filho de Deus" },
      { number: 2, direction: "across", row: 3, col: 2, answer: "SAL",   clue: "‘Vós sois o ___ da terra’" },
      { number: 3, direction: "across", row: 4, col: 1, answer: "LUZ",   clue: "‘Eu sou a ___ do mundo’" },
      { number: 3, direction: "down",   row: 4, col: 1, answer: "LEI",   clue: "Mandamentos dados por Deus" },
      { number: 4, direction: "across", row: 5, col: 2, answer: "SIM",   clue: "Resposta afirmativa" },
    ];

 const payload = {
  weekId,
  title,
  size: 7,
  published: true,
  gridRows, // ✅ em vez de grid
  entries,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};


    await admin.firestore().collection("crosswords").doc(weekId).set(payload, { merge: true });

    return res.json({ ok: true, weekId, title });
  } catch (err: any) {
    console.log("❌ /admin/crossword/seed", err);
    return res.status(err?.status ?? 500).json({
      ok: false,
      error: err?.message ?? "Erro ao criar cruzada",
    });
  }
});

export default router;
