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

// grupoId (Firestore) -> nome da rota da tela do grupo no app
const GROUP_SCREENS: Record<GroupId, string> = {
  louvor: "LouvorScreen",
  amareservir: "AmareServirScreen",
  varoes: "VaroesScreen",
  guerreiras: "GuerreirasScreen",
  adolescentes: "AdolescentesScreen",
  danca: "DancaScreen",
  geracao: "GeracaoScreen",
  obreiros: "ObreirosScreen",
  infantil: "InfantilScreen",
  midia: "MidiaScreen",
};

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

async function getLastMessageAt(grupoId: string) {
  const snap = await db
    .collection("grupos")
    .doc(grupoId)
    .collection("chat")
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  const d = snap.docs[0];
  if (!d) return null;

  const ts = d.get("timestamp") || d.get("createdAt");
  return ts?.toDate ? ts.toDate() : null;
}

async function getGroupUserUids(grupoSlug: string) {
  const snap = await db
    .collection("usuarios")
    .where(`notificacoes.${grupoSlug}`, "!=", null)
    .get();

  return snap.docs.map((d) => d.id);
}

async function getTokensByUids(uids: string[]) {
  if (!uids.length) return [];

  const chunkSize = 10; // limite do "in"
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += chunkSize)
    chunks.push(uids.slice(i, i + chunkSize));

  const tokens: string[] = [];

  for (const chunk of chunks) {
    const devSnap = await db
      .collection("push_devices")
      .where("uid", "in", chunk)
      .get();

    console.log(`📲 push_devices encontrados (chunk): ${devSnap.size}`);

    devSnap.forEach((d) => {
      const t = d.get("expoToken");
      if (typeof t === "string" && t.startsWith("ExponentPushToken")) {
        tokens.push(t);
      }
    });
  }

  const unique = Array.from(new Set(tokens));
  console.log(`✅ tokens válidos: ${unique.length}`);
  return unique;
}

async function runDigestForGroup(grupoId: GroupId) {
  console.log(`\n--- grupo=${grupoId} ---`);
  const lastMsgAt = await getLastMessageAt(grupoId);
  console.log("lastMsgAt:", lastMsgAt?.toISOString?.() ?? null);
  if (!lastMsgAt) return;

  const stateRef = db.collection("notifs_grupo_state").doc(grupoId);
  const stateSnap = await stateRef.get();

  const lastNotifiedMsgAt: Date | null = stateSnap.exists
    ? (stateSnap.get("lastNotifiedMsgAt")?.toDate?.() ?? null)
    : null;
  console.log("lastNotifiedMsgAt:", lastNotifiedMsgAt?.toISOString?.() ?? null);

  // Se não tem msg nova desde o último push, sai
  if (!lastMsgAt) return;
  if (lastNotifiedMsgAt && lastMsgAt <= lastNotifiedMsgAt) {
    console.log("⏭️ sem msg nova (não notifica)");
    return;
  }
  // Busca todos os usuários do grupo e tokens
  const uids = await getGroupUserUids(grupoId);
  console.log("uids do grupo:", uids.length);
  const tokens = await getTokensByUids(uids);
  console.log("tokens:", tokens.length);

  if (tokens.length) {
    await sendExpoPush(
      tokens,
      "Nova mensagem no grupo",
      "Tem mensagens novas no seu grupo. Abra o app para ver.",
      { type: "group_chat", grupoId, screen: GROUP_SCREENS[grupoId] },
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
