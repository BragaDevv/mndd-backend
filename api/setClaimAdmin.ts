// api/setClaimAdmin.ts
import admin from "firebase-admin";
import { Request, Response } from "express";

const OWNER_EMAILS = new Set(["bragadevv@gmail.com"]); // quem pode promover rebaixar

export default async function setClaimAdminHandler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { uid, isAdmin } = req.body ?? {};
    if (!uid || typeof isAdmin !== "boolean") {
      return res.status(400).json({ error: "uid e isAdmin obrigatórios" });
    }

    // --- Autorização: exige Authorization: Bearer <idToken> do chamador
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) return res.status(401).json({ error: "Sem token (Authorization)" });

    const caller = await admin.auth().verifyIdToken(idToken);
    const callerEmail = (caller.email || "").toLowerCase();

    const callerIsAllowed = caller.admin === true || OWNER_EMAILS.has(callerEmail);
    if (!callerIsAllowed) return res.status(403).json({ error: "Sem permissão" });

    // --- Aplica o claim
    await admin.auth().setCustomUserClaims(uid, { admin: !!isAdmin });
    // (opcional) força refresh do token desse usuário
    await admin.auth().revokeRefreshTokens(uid);

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("set-claim-admin error:", e);
    return res.status(500).json({ error: "Erro interno" });
  }
}
