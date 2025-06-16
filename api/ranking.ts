// api/ranking.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

export default async function rankingHandler(req: Request, res: Response) {
  try {
    const snapshot = await admin.firestore().collection("ranking").get();

    const rankingOrdenado = snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as { nome?: string; pontuacao: number }) }))
      .sort((a: any, b: any) => b.pontuacao - a.pontuacao);

    if (rankingOrdenado.length === 0) {
      return res.status(200).json({ message: "Ranking vazio." });
    }

    const novoLider = rankingOrdenado[0];
    const docRef = admin.firestore().collection("configuracoes").doc("ranking");
    const docSnap = await docRef.get();
    const anterior = docSnap.exists ? docSnap.data()?.liderId : null;

    // ⚠️ Se não mudou de líder, não faz nada
    if (anterior === novoLider.id) {
      return res.status(200).json({ message: "Líder não mudou." });
    }

    // ✅ Salva o novo líder
    await docRef.set({ liderId: novoLider.id, nome: novoLider.nome });

    // ✅ Envia notificação a todos
    const tokensSnap = await admin.firestore().collection("usuarios").get();
    const tokens = tokensSnap.docs
      .map((doc) => doc.data().expoToken)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

    if (tokens.length === 0) {
      return res.status(200).json({ message: "Sem tokens válidos." });
    }

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: "👑 Temos um novo líder!",
      body: `${novoLider.nome || "Alguém"} assumiu o topo do ranking do Quiz MNDD!`,
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoResult = await response.json();

    return res.status(200).json({ message: "Notificações enviadas.", expoResult });
  } catch (error) {
    console.error("❌ Erro ao checar ranking:", error);
    return res.status(500).json({ error: "Erro ao processar ranking." });
  }
}
