// api/excluirUsuario.ts
import admin from "firebase-admin";
import { Request, Response } from "express";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "bragadevv@gmail.com";

export default async function excluirUsuarioHandler(req: Request, res: Response) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // 1) Autenticação via Bearer <idToken>
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: "sem-auth" });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const requesterUid = decoded.uid;
    const requesterEmail = (decoded.email || "").toLowerCase();

    // 2) Alvo da deleção
    const bodyUid = (req.body?.uid as string | undefined) || requesterUid;

    // 3) Autorização:
    //    - próprio usuário pode deletar a si mesmo
    //    - owner (email == OWNER_EMAIL) pode deletar qualquer uid
    const isSelf = bodyUid === requesterUid;
    const isOwner = requesterEmail === OWNER_EMAIL.toLowerCase();

    if (!isSelf && !isOwner) {
      return res.status(403).json({ error: "forbidden" });
    }

    // 4) Apagar Firestore (doc + TODAS subcoleções)
    const userDocRef = admin.firestore().doc(`usuarios/${bodyUid}`);
    await admin.firestore().recursiveDelete(userDocRef);

    // 5) Apagar do Auth (ignore se já não existir)
    try {
      await admin.auth().deleteUser(bodyUid);
    } catch (e: any) {
      if (e?.code !== "auth/user-not-found") throw e;
    }

    return res.status(200).json({ sucesso: true, mensagem: "Usuário e dados removidos." });
  } catch (error: any) {
    console.error("Erro ao excluir usuário:", error);
    return res.status(500).json({ error: error?.message || "Erro interno" });
  }
}
