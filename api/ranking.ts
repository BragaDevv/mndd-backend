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

async function sendExpoInChunks(messages: any[]) {
  const chunks = chunkArray(messages, 100); // Expo recomenda até 100 por request
  const results: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    console.log(
      `[RANKING] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
    );

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    const status = response.status;
    const payload = await response.json().catch(async () => ({
      error: "non-json-response",
      status,
      raw: (await response.text()).slice(0, 500),
    }));

    if (status < 200 || status >= 300) {
      console.error("[RANKING] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

export default async function rankingHandler(req: Request, res: Response) {
  try {
    console.log("🚨 Iniciando verificação de liderança no ranking...");

    const snapshot = await admin.firestore().collection("ranking").get();

    const rankingOrdenado = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as { nome?: string; pontuacao: number }),
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

    if (anterior) console.log("📌 Último líder salvo:", anterior);
    else console.log("📌 Nenhum líder anterior salvo.");

    if (anterior === novoLider.id) {
      console.log("✅ O líder não mudou. Nenhuma notificação enviada.");
      return res.status(200).json({ message: "Líder não mudou." });
    }

    console.log("🔁 Novo líder detectado! Salvando novo líder...");
    await docRef.set({ liderId: novoLider.id, nome: novoLider.nome }, { merge: true });

    // ✅ AGORA: pegar todos os TOKENS LOGADOS direto de push_devices
    const devicesSnap = await admin
      .firestore()
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    const tokens = devicesSnap.docs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    const uniqueTokens = Array.from(new Set(tokens));

    console.log("[RANKING] devices logados encontrados:", devicesSnap.size);
    console.log(`📲 Tokens válidos (únicos): ${uniqueTokens.length}`);

    if (uniqueTokens.length === 0) {
      console.log("⚠️ Nenhum token válido para envio (push_devices logados).");
      return res.status(200).json({ message: "Sem tokens válidos (logados)." });
    }

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "👑 Temos um novo líder!",
      body: `${novoLider.nome || "Alguém"} assumiu o topo do ranking do Quiz MNDD!`,
      data: { type: "ranking_leader", screen: "GamesHomeScreen" },
    }));

    console.log("🚀 Enviando notificações para todos os DEVICES LOGADOS...");

    const expoResult = await sendExpoInChunks(messages);
    console.log("📬 Resultado do envio (chunks):", expoResult.length);

    return res.status(200).json({
      message: "Notificações enviadas para todos os devices logados.",
      sent: uniqueTokens.length,
      expoChunks: expoResult.length,
    });
  } catch (error) {
    console.error("❌ Erro ao checar ranking:", error);
    return res.status(500).json({ error: "Erro ao processar ranking." });
  }
}
