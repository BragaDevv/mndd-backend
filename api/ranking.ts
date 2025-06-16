import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

export default async function rankingHandler(req: Request, res: Response) {
  try {
    console.log("🚨 Iniciando verificação de liderança no ranking...");

    const snapshot = await admin.firestore().collection("ranking").get();

    const rankingOrdenado = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as { nome?: string; pontuacao: number })
      }))
      .sort((a, b) => b.pontuacao - a.pontuacao);

    if (rankingOrdenado.length === 0) {
      console.log("⚠️ Ranking vazio.");
      return res.status(200).json({ message: "Ranking vazio." });
    }

    const novoLider = rankingOrdenado[0];
    console.log("👑 Novo líder encontrado:", novoLider.nome || novoLider.id);

    const docRef = admin.firestore().collection("configuracoes").doc("ranking");
    const docSnap = await docRef.get();
    const anterior = docSnap.exists ? docSnap.data()?.liderId : null;

    if (anterior) {
      console.log("📌 Último líder salvo:", anterior);
    } else {
      console.log("📌 Nenhum líder anterior salvo.");
    }

    if (anterior === novoLider.id) {
      console.log("✅ O líder não mudou. Nenhuma notificação enviada.");
      return res.status(200).json({ message: "Líder não mudou." });
    }

    console.log("🔁 Novo líder detectado! Salvando novo líder...");
    await docRef.set({ liderId: novoLider.id, nome: novoLider.nome });

    const tokensSnap = await admin.firestore().collection("usuarios").get();
    const tokens = tokensSnap.docs
      .map((doc) => doc.data().expoToken)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

    console.log(`📲 Total de tokens válidos encontrados: ${tokens.length}`);

    if (tokens.length === 0) {
      console.log("⚠️ Nenhum token válido para envio.");
      return res.status(200).json({ message: "Sem tokens válidos." });
    }

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: "👑 Temos um novo líder!",
      body: `${novoLider.nome || "Alguém"} assumiu o topo do ranking do Quiz MNDD!`,
    }));

    console.log("🚀 Enviando notificações para todos os tokens...");

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
    console.log("📬 Resultado do envio:", expoResult);

    return res.status(200).json({ message: "Notificações enviadas.", expoResult });

  } catch (error) {
    console.error("❌ Erro ao checar ranking:", error);
    return res.status(500).json({ error: "Erro ao processar ranking." });
  }
}
