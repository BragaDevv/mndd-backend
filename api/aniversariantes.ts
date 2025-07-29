import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const modoTeste = req.query.teste?.toString() === "true";

  try {
    const snapshot = await admin.firestore().collection("usuarios").get();

    const hoje = new Date();
    const diaHoje = String(hoje.getDate()).padStart(2, "0");
    const mesHoje = String(hoje.getMonth() + 1).padStart(2, "0");

    const aniversariantes: { nome: string; token: string; id: string }[] = [];
    const todosTokens: { token: string; id: string }[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const id = doc.id;
      const dataNascimento = data.dataNascimento;
      const token = data.expoToken;
      const nome = data.nome || "Irmão(a)";

      if (typeof token === "string" && token.startsWith("ExponentPushToken")) {
        todosTokens.push({ token, id });
      }

      if (
        typeof dataNascimento === "string" &&
        typeof token === "string" &&
        dataNascimento.includes("/")
      ) {
        const [dia, mes] = dataNascimento.split("/");
        if (dia === diaHoje && mes === mesHoje) {
          aniversariantes.push({ nome, token, id });
        }
      }
    }

    console.log("🎯 Total de aniversariantes do dia:", aniversariantes.length);
    if (aniversariantes.length === 0) {
      console.log("✅ Nenhum aniversariante encontrado hoje.");
    } else {
      console.log("🎉 Aniversariantes de hoje:", aniversariantes.map(u => u.nome).join(", "));
    }


    const enviados = {
      aniversariantes: 0,
      paraTodos: 0,
    };

    // 1. Enviar notificação personalizada para cada aniversariante
    for (const user of aniversariantes) {
      if (!modoTeste) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: user.token,
            sound: "default",
            title: "🎉 Feliz aniversário!",
            body: `Que Deus abençoe seu dia, ${user.nome}! 🙌🎂`,
          }),
        });
      }
      enviados.aniversariantes++;
    }

    // 2. Enviar notificação para todos os tokens com base na quantidade
    if (aniversariantes.length > 0) {
      for (const user of todosTokens) {
        if (!modoTeste) {
          const message =
            aniversariantes.length === 1
              ? {
                title: "🎉 Parabénssss !",
                body: `Hoje é seu dia, ${aniversariantes[0].nome}! 🎂`,
              }
              : {
                title: "🎉 Feliz aniversário!",
                body: "Acesse o app e veja quem está celebrando hoje! 🎂",
              };

          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Accept-encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: user.token,
              sound: "default",
              title: message.title,
              body: message.body,
            }),
          });
        }
        enviados.paraTodos++;
      }
    }


    return res.status(200).json({
      success: true,
      modoTeste,
      totalAniversariantes: aniversariantes.length,
      enviados,
      message: modoTeste
        ? "Modo teste: tokens identificados."
        : "Notificações enviadas com sucesso.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro ao enviar notificações:", msg);
    return res.status(500).json({ success: false, error: msg });
  }
}
