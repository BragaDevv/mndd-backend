// api/redefinirSenha.ts

import { Request, Response } from "express";
import admin from "firebase-admin";

export default async function redefinirSenhaHandler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { email, novaSenha } = req.body;

  if (!email || !novaSenha) {
    return res.status(400).json({ error: "Email e novaSenha são obrigatórios." });
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, { password: novaSenha });

    return res.status(200).json({ sucesso: true, mensagem: "Senha redefinida com sucesso." });
  } catch (error: any) {
    console.error("Erro ao redefinir senha:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao redefinir senha." });
  }
}
