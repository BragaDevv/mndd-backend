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
      `[VERSICULO] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
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
      console.error("[VERSICULO] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

/**
 * Data "hoje" do jogo no formato YYYY-MM-DD (igual ao dia gerado no app).
 * O dia do jogo vira às 09:30 (SP), então deslocamos o instante atual em 9h30
 * antes de pegar a data no fuso de São Paulo.
 */
function hojeSP(): string {
  const CUTOFF_MS = (9 * 60 + 30) * 60000; // 09:30
  const shifted = new Date(Date.now() - CUTOFF_MS);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

function formatTime(seconds: number) {
  const s = Math.max(0, Number(seconds || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default async function versiculoLeaderHandler(req: Request, res: Response) {
  try {
    console.log("📖 Iniciando verificação de liderança no Adivinhe o Versículo...");

    const dia = String(req.body?.dia ?? hojeSP());
    // modo teste: envia apenas para este uid e ignora o gate "líder não mudou"
    const onlyUid = req.body?.onlyUid ? String(req.body.onlyUid) : null;
    console.log("📌 Dia avaliado:", dia, onlyUid ? `(teste onlyUid=${onlyUid})` : "");

    // 1) ranking do dia: versiculo_rankings/{dia}/scores
    const scoresSnap = await admin
      .firestore()
      .collection("versiculo_rankings")
      .doc(dia)
      .collection("scores")
      .get();

    if (scoresSnap.empty) {
      console.log("⚠️ Ranking do dia vazio (ninguém acertou ainda).");
      return res.status(200).json({ message: "Ranking do dia vazio.", dia });
    }

    // mesmo critério do app: menos tentativas; empate => menor tempo
    const ordenado = scoresSnap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          nome: String(data.name ?? data.nome ?? "Alguém"),
          attempts: Number(data.attempts ?? 6),
          timeSeconds: Number(data.timeSeconds ?? 0),
        };
      })
      .sort((a, b) => a.attempts - b.attempts || a.timeSeconds - b.timeSeconds);

    const novoLider = ordenado[0];
    console.log("👑 Novo líder encontrado:", novoLider);

    // 2) comparar com o líder salvo
    const configId = `versiculo_ranking_${dia}`;
    const docRef = admin.firestore().collection("configuracoes").doc(configId);
    const docSnap = await docRef.get();
    const anteriorId = docSnap.exists ? docSnap.data()?.liderId : null;
    const anteriorAttempts = docSnap.exists ? Number(docSnap.data()?.attempts ?? -1) : -1;
    const anteriorTime = docSnap.exists ? Number(docSnap.data()?.timeSeconds ?? -1) : -1;

    console.log("📌 Último líder salvo:", { anteriorId, anteriorAttempts, anteriorTime });

    if (!onlyUid) {
      if (
        anteriorId === novoLider.id &&
        anteriorAttempts === novoLider.attempts &&
        anteriorTime === novoLider.timeSeconds
      ) {
        console.log("✅ O líder não mudou. Nenhuma notificação enviada.");
        return res.status(200).json({ message: "Líder não mudou.", dia });
      }

      console.log("🔁 Novo líder detectado! Salvando...");
      await docRef.set(
        {
          liderId: novoLider.id,
          nome: novoLider.nome,
          attempts: novoLider.attempts,
          timeSeconds: novoLider.timeSeconds,
          dia,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      console.log("🧪 Modo teste: pulando gate/salvamento e enviando só para o onlyUid.");
    }

    // 3) tokens dos devices logados (no modo teste, só do onlyUid)
    const devicesSnap = await admin
      .firestore()
      .collection("push_devices")
      .where("isLoggedIn", "==", true)
      .get();

    const deviceDocs = onlyUid
      ? devicesSnap.docs.filter((d) => d.data()?.uid === onlyUid)
      : devicesSnap.docs;

    const tokens = deviceDocs
      .map((d) => d.data()?.expoToken)
      .filter(isValidExpoToken);

    const uniqueTokens = Array.from(new Set(tokens));

    console.log("[VERSICULO] devices logados encontrados:", devicesSnap.size);
    console.log(`📲 Tokens válidos (únicos): ${uniqueTokens.length}`);

    if (uniqueTokens.length === 0) {
      console.log("⚠️ Nenhum token válido para envio (push_devices logados).");
      return res.status(200).json({ message: "Sem tokens válidos (logados).", dia });
    }

    const tempo = formatTime(novoLider.timeSeconds);

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "👑 Novo Líder !",
      body: `🔥 ${novoLider.nome} assumiu o 1º lugar de hoje no #PalavraDoDia! Bora retomar a liderança? ⚔️`,
      data: { type: "guessverse_leader", dia, screen: "GamesHomeScreen" },
    }));

    console.log("🚀 Enviando notificações (Versículo) para todos os DEVICES LOGADOS...");

    const expoResult = await sendExpoInChunks(messages);

    return res.status(200).json({
      message: "Notificações enviadas para todos os devices logados.",
      dia,
      sent: uniqueTokens.length,
      expoChunks: expoResult.length,
      leader: novoLider,
    });
  } catch (error) {
    console.error("❌ Erro ao checar ranking do versículo:", error);
    return res.status(500).json({ error: "Erro ao processar ranking do versículo." });
  }
}
