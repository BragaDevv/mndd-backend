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
  const chunks = chunkArray(messages, 100);

  for (const chunk of chunks) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
  }
}

export default async function crosswordPublishedHandler(
  req: Request,
  res: Response
) {
  try {
    console.log("🔍 Verificando nova cruzada publicada...");

    const pubSnap = await admin
      .firestore()
      .collection("crosswords")
      .where("published", "==", true)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (pubSnap.empty) {
      return res.status(200).json({ message: "Nenhuma cruzada publicada." });
    }

    const doc = pubSnap.docs[0];
    const data = doc.data();
    const weekId = data.weekId ?? doc.id;
    const title = data.title ?? "Palavras Cruzadas";

    const configRef = admin
      .firestore()
      .collection("configuracoes")
      .doc("crossword_publication");

    const configSnap = await configRef.get();
    const lastNotifiedWeek = configSnap.exists
      ? configSnap.data()?.lastWeekId
      : null;

    if (lastNotifiedWeek === weekId) {
      console.log("✅ Push já enviado para essa cruzada.");
      return res.status(200).json({ message: "Já notificado." });
    }

    console.log("🚀 Nova cruzada detectada! Enviando push...");

    const devicesSnap = await admin
      .firestore()
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    const tokens = devicesSnap.docs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    const uniqueTokens = Array.from(new Set(tokens));

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "🧩 Nova Cruzada Disponível!",
      body: `${title} já está disponível. Corra para jogar!`,
      data: { type: "crossword_new", weekId },
    }));

    await sendExpo(messages);

    await configRef.set(
      {
        lastWeekId: weekId,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({
      message: "Push enviado com sucesso!",
      sent: uniqueTokens.length,
    });
  } catch (error) {
    console.error("❌ Erro:", error);
    return res.status(500).json({ error: "Erro ao processar." });
  }
}
