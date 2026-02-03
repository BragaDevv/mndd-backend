import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

function isValidExpoToken(t: any): t is string {
  return (
    typeof t === "string" &&
    (t.startsWith("ExpoPushToken[") || t.startsWith("ExponentPushToken["))
  );
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendExpo(messages: any[]) {
  const chunks = chunkArray(messages, 100); // Expo: até 100
  const results: any[] = [];

  for (const chunk of chunks) {
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    const status = resp.status;
    const payload = await resp.json().catch(async () => ({
      error: "non-json-response",
      status,
      raw: (await resp.text()).slice(0, 500),
    }));

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const modoTeste = req.query.teste === "true";

  try {
    const db = admin.firestore();

    // 1️⃣ Busca aniversariantes em usuarios
    const usersSnap = await db.collection("usuarios").get();

    const hoje = new Date();
    const diaHoje = String(hoje.getDate()).padStart(2, "0");
    const mesHoje = String(hoje.getMonth() + 1).padStart(2, "0");

    const aniversariantes: { uid: string; nome: string }[] = [];

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const dataNascimento = data.dataNascimento;
      const nome = data.nome || "Irmão(a)";

      if (typeof dataNascimento === "string" && dataNascimento.includes("/")) {
        const [dia, mes] = dataNascimento.split("/");
        if (dia === diaHoje && mes === mesHoje) {
          aniversariantes.push({ uid: doc.id, nome });
        }
      }
    }

    console.log("🎂 Aniversariantes hoje:", aniversariantes.map(a => a.nome));

    if (aniversariantes.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Nenhum aniversariante hoje.",
      });
    }

    // 2️⃣ TODOS os devices logados (query direta)
    const devicesSnap = await db
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    const tokensTodosLogados = devicesSnap.docs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    const uniqueTokens = Array.from(new Set(tokensTodosLogados));

    console.log("📲 Tokens logados:", uniqueTokens.length);

    // 3️⃣ Mensagem
    const message =
      aniversariantes.length === 1
        ? {
            title: "🎉 Parabéns!",
            body: `Hoje é o aniversário de ${aniversariantes[0].nome}! 🎂`,
          }
        : {
            title: "🎉 Feliz aniversário!",
            body: "Hoje temos aniversariantes! 🎂 Acesse o app para conferir.",
          };

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: message.title,
      body: message.body,
    }));

    if (!modoTeste && messages.length > 0) {
      await sendExpo(messages);
    }

    return res.status(200).json({
      success: true,
      modoTeste,
      totalAniversariantes: aniversariantes.length,
      totalDevicesLogados: uniqueTokens.length,
      message: modoTeste
        ? "Modo teste: tokens identificados."
        : "Notificação enviada para todos os devices logados.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro aniversariantes:", msg);
    return res.status(500).json({ success: false, error: msg });
  }
}
