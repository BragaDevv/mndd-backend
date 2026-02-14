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
  const chunks = chunkArray(messages, 100);
  const results: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    console.log(
      `[CROSSWORD] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
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

    // tenta JSON; se falhar, captura texto
    const payload = await response.json().catch(async () => ({
      error: "non-json-response",
      status,
      raw: (await response.text()).slice(0, 500),
    }));

    if (status < 200 || status >= 300) {
      console.error("[CROSSWORD] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

function formatTime(seconds: number) {
  const s = Math.max(0, Number(seconds || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export default async function crosswordLeaderHandler(req: Request, res: Response) {
  try {
    console.log("🧩 Iniciando verificação de liderança no ranking da Cruzada...");

    // 1) pegar cruzada publicada mais recente
    const pubSnap = await admin
      .firestore()
      .collection("crosswords")
      .where("published", "==", true)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (pubSnap.empty) {
      console.log("⚠️ Nenhuma cruzada publicada.");
      return res.status(200).json({ message: "Nenhuma cruzada publicada." });
    }

    const cwDoc = pubSnap.docs[0];
    const cwData = cwDoc.data() as any;
    const weekId = String(cwData.weekId ?? cwDoc.id);
    const title = String(cwData.title ?? "Palavras Cruzadas");

    console.log("📌 Cruzada publicada:", { id: cwDoc.id, weekId, title });

    // 2) buscar líder no ranking dessa cruzada (menor timeSeconds)
    const scoresRef = admin
      .firestore()
      .collection("crossword_rankings")
      .doc(weekId)
      .collection("scores");

    const leaderSnap = await scoresRef.orderBy("timeSeconds", "asc").limit(1).get();

    if (leaderSnap.empty) {
      console.log("⚠️ Ranking da cruzada vazio (ninguém concluiu ainda).");
      return res.status(200).json({ message: "Ranking da cruzada vazio." });
    }

    const leaderDoc = leaderSnap.docs[0];
    const leader = leaderDoc.data() as any;

    const novoLider = {
      id: leaderDoc.id,
      nome: String(leader.name ?? leader.nome ?? "Alguém"),
      timeSeconds: Number(leader.timeSeconds ?? 0),
    };

    console.log("👑 Novo líder encontrado:", novoLider);

    // 3) comparar com o líder salvo em configuracoes
    const configId = `crossword_ranking_${weekId}`;
    const docRef = admin.firestore().collection("configuracoes").doc(configId);
    const docSnap = await docRef.get();
    const anteriorId = docSnap.exists ? docSnap.data()?.liderId : null;
    const anteriorTime = docSnap.exists ? Number(docSnap.data()?.timeSeconds ?? 0) : null;

    console.log("📌 Último líder salvo:", { anteriorId, anteriorTime });

    // Se líder e tempo iguais, não faz nada
    if (anteriorId === novoLider.id && anteriorTime === novoLider.timeSeconds) {
      console.log("✅ O líder não mudou. Nenhuma notificação enviada.");
      return res.status(200).json({ message: "Líder não mudou." });
    }

    console.log("🔁 Novo líder detectado! Salvando novo líder...");
    await docRef.set(
      {
        liderId: novoLider.id,
        nome: novoLider.nome,
        timeSeconds: novoLider.timeSeconds,
        weekId,
        title,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 4) pegar tokens dos devices logados
    const devicesSnap = await admin
      .firestore()
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    const tokens = devicesSnap.docs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    const uniqueTokens = Array.from(new Set(tokens));

    console.log("[CROSSWORD] devices logados encontrados:", devicesSnap.size);
    console.log(`📲 Tokens válidos (únicos): ${uniqueTokens.length}`);

    if (uniqueTokens.length === 0) {
      console.log("⚠️ Nenhum token válido para envio (push_devices logados).");
      return res.status(200).json({ message: "Sem tokens válidos (logados)." });
    }

    const tempo = formatTime(novoLider.timeSeconds);

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "👑 Novo líder na Cruzada!🧩",
      body: `${novoLider.nome} assumiu o topo da cruzada (${tempo})!`,
      data: { type: "crossword_leader", weekId },
    }));

    console.log("🚀 Enviando notificações (Cruzada) para todos os DEVICES LOGADOS...");

    const expoResult = await sendExpoInChunks(messages);

    return res.status(200).json({
      message: "Notificações enviadas para todos os devices logados.",
      weekId,
      sent: uniqueTokens.length,
      expoChunks: expoResult.length,
      leader: novoLider,
    });
  } catch (error) {
    console.error("❌ Erro ao checar ranking da cruzada:", error);
    return res.status(500).json({ error: "Erro ao processar ranking da cruzada." });
  }
}
