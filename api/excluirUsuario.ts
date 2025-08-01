import admin from "firebase-admin";
import { Request, Response } from "express";

export default async function excluirUsuarioHandler(req: Request, res: Response) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: "UID é obrigatório." });
  }

  try {
    await admin.auth().deleteUser(uid);
    return res.status(200).json({ sucesso: true, mensagem: "Usuário excluído com sucesso." });
  } catch (error: any) {
    console.error("Erro ao excluir usuário:", error);
    return res.status(500).json({ error: error.message });
  }
}
