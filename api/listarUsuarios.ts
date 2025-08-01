import admin from "firebase-admin";
import { Request, Response } from "express";

export default async function listarUsuariosHandler(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const usuarios: any[] = [];

    const buscarTodos = async (token?: string) => {
      const result = await admin.auth().listUsers(1000, token);
      result.users.forEach((u) => {
        if (u.email) { // 👈 só inclui quem tem email (ignora anônimos)
          usuarios.push({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || "",
            customClaims: u.customClaims || {},
          });
        }
      });

      if (result.pageToken) await buscarTodos(result.pageToken);
    };

    await buscarTodos();
    return res.status(200).json({ usuarios });
  } catch (error: any) {
    console.error("Erro:", error);
    return res.status(500).json({ error: error.message });
  }
}
