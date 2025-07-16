import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const modoTeste = req.query.teste === "true"; // ou via body

  try {
    const snapshot = await admin.firestore().collection("usuarios").get();
    const hoje = new Date();
    const diaHoje = String(hoje.getDate()).padStart(2, "0");
    const mesHoje = String(hoje.getMonth() + 1).padStart(2, "0");

    const aniversariantes: any[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const dataNascimento = data.dataNascimento;

      if (typeof dataNascimento === "string" && dataNascimento.includes("/")) {
        const [dia, mes] = dataNascimento.split("/");

        if (dia === diaHoje && mes === mesHoje) {
          aniversariantes.push({
            nome: data.nome,
            token: data.expoToken,
            dataNascimento,
          });

          if (!modoTeste) {
            const token = data.expoToken;
            if (
              typeof token === "string" &&
              token.startsWith("ExponentPushToken")
            ) {
              await fetch("https://exp.host/--/api/v2/push/send", {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Accept-encoding": "gzip, deflate",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  to: token,
                  sound: "default",
                  title: "🎉 Feliz Aniversário!",
                  body: `Deus te abençoe, ${data.nome || "Irmão(a)"}! 🙌🎂`,
                }),
              });
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      modoTeste,
      aniversariantes,
      message: modoTeste
        ? "Teste: aniversariantes identificados com sucesso."
        : `Notificações enviadas para ${aniversariantes.length} aniversariante(s).`,
    });
  } catch (error) {
    console.error("Erro:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({ success: false, error: msg });
  }
}
