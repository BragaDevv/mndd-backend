import admin from "firebase-admin";
import { Request, Response } from "express";

export default async function criarUsuarioHandler(req: Request, res: Response) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    try {
        const novoUsuario = await admin.auth().createUser({
            email,
            password: senha,
        });

        return res.status(201).json({
            sucesso: true,
            uid: novoUsuario.uid,
            mensagem: "Usuário criado com sucesso!",
        });
    } catch (error: any) {
        console.error("Erro ao criar usuário:", error);
        return res.status(500).json({
            error: error.message || "Erro interno ao criar usuário.",
        });
    }
}
