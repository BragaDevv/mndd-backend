import admin from "firebase-admin";
import cron from "node-cron";

const db = admin.firestore();

const GROUPS = [
  "louvor",
  "amareservir",
  "varoes",
  "guerreiras",
  "adolescentes",
  "danca",
  "geracao",
  "obreiros",
  "infantil",
  "midia",
] as const;

type GroupId = (typeof GROUPS)[number];

function isExpoToken(t: any) {
  return typeof t === "string" && t.startsWith("ExponentPushToken");
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: any,
) {
  if (!tokens.length) return;

  // Expo recomenda enviar em chunks
  const chunkSize = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += chunkSize)
    chunks.push(tokens.slice(i, i + chunkSize));

  for (const chunk of chunks) {
    const messages = chunk.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      data: data ?? {},
      priority: "high",
    }));

    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("❌ Expo push error:", resp.status, txt);
    }
  }
}

async function getLastMessageAt(grupoId: GroupId) {
  const snap = await db
    .collection("grupos")
    .doc(grupoId)
    .collection("chat")
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  const doc = snap.docs[0];
  const ts = doc?.get("timestamp");
  return ts?.toDate ? ts.toDate() : null;
}

async function getGroupUserUids(grupoId: GroupId) {
  const snap = await db
    .collection("usuarios")
    .where("grupos", "array-contains", grupoId)
    .get();
  return snap.docs.map((d) => d.id);
}

async function getTokensByUids(uids: string[]) {
  if (!uids.length) return [];

  // Firestore "in" suporta até 10 por vez → chunk
  const chunkSize = 10;
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += chunkSize)
    chunks.push(uids.slice(i, i + chunkSize));

  const tokens: string[] = [];

  for (const chunk of chunks) {
    const devSnap = await db
      .collection("push_devices")
      .where("uid", "in", chunk)
      .get();

    devSnap.forEach((d) => {
      const t = d.get("expoToken");
      if (isExpoToken(t)) tokens.push(t);
    });
  }

  // remove duplicados
  return Array.from(new Set(tokens));
}

async function runDigestForGroup(grupoId: GroupId) {
  const lastMsgAt = await getLastMessageAt(grupoId);
  if (!lastMsgAt) return;

  const stateRef = db.collection("notifs_grupo_state").doc(grupoId);
  const stateSnap = await stateRef.get();

  const lastNotifiedMsgAt: Date | null = stateSnap.exists
    ? (stateSnap.get("lastNotifiedMsgAt")?.toDate?.() ?? null)
    : null;

  // Se não tem msg nova desde o último push, sai
  if (lastNotifiedMsgAt && lastMsgAt <= lastNotifiedMsgAt) return;

  // Busca todos os usuários do grupo e tokens
  const uids = await getGroupUserUids(grupoId);
  const tokens = await getTokensByUids(uids);

  if (tokens.length) {
    await sendExpoPush(
      tokens,
      "Nova mensagem no grupo",
      "Tem mensagens novas no seu grupo. Abra o app para ver.",
      { type: "group_chat", grupoId },
    );
    console.log(`✅ Push enviado: grupo=${grupoId}, tokens=${tokens.length}`);
  } else {
    console.log(`ℹ️ Sem tokens para grupo=${grupoId}`);
  }

  // Atualiza estado para bloquear novos pushes até o próximo horário
  await stateRef.set(
    {
      lastNotifiedMsgAt: admin.firestore.Timestamp.fromDate(lastMsgAt),
      lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      grupoId,
    },
    { merge: true },
  );
}

export function startGroupsDigestCron() {
  // Roda de hora em hora (minuto 0)
  cron.schedule("* * * * *", async () => {
    console.log("⏰ Cron digest grupos: iniciando…");

    for (const grupoId of GROUPS) {
      try {
        await runDigestForGroup(grupoId);
      } catch (e) {
        console.error(`❌ Erro cron grupo=${grupoId}`, e);
      }
    }

    console.log("✅ Cron digest grupos: fim.");
  });
}
