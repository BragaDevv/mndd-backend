import admin from "firebase-admin";
import fetch from "node-fetch";

/** Retorna a data de hoje no fuso de São Paulo no formato YYYY-MM-DD */
export function hojeSP_ISO(): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [dia, mes, ano] = fmt.format(new Date()).split("/");
  return `${ano}-${mes}-${dia}`;
}

/** Retorna o início e o fim do dia de hoje em SP como Timestamp do Firestore */
function intervaloHojeSP() {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [d, m, y] = fmt.format(new Date()).split("/");

  const inicio = new Date(`${y}-${m}-${d}T00:00:00-03:00`);
  const fim = new Date(`${y}-${m}-${d}T23:59:59.999-03:00`);

  return {
    inicio: admin.firestore.Timestamp.fromDate(inicio),
    fim: admin.firestore.Timestamp.fromDate(fim),
  };
}

// ============================
// ✅ MESMA LÓGICA DO VERSÍCULO
// ============================

function isValidExpoToken(t: any): t is string {
  return (
    typeof t === "string" &&
    (t.startsWith("ExpoPushToken[") || t.startsWith("ExponentPushToken["))
  );
}

function safeBody(input: string, max = 220) {
  const s = (input ?? "").toString().trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// limita concorrência pra não estourar o Firestore
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length) as any;
  let i = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/** Verifica se existe devocional MNDD para hoje e envia notificação se existir */
export async function verificarDevocionalMNDDNovo() {
  const db = admin.firestore();
  const col = db.collection("devocionais_mndd");
  const hojeISO = hojeSP_ISO();
  const { inicio, fim } = intervaloHojeSP();

  let docEncontrado: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  // 1️⃣ Consulta pelo campo 'data'
  try {
    const snap = await col.where("data", "==", hojeISO).limit(1).get();
    if (!snap.empty) docEncontrado = snap.docs[0];
  } catch (err) {
    console.warn("⚠️ Erro na consulta por 'data':", err);
  }

  // 2️⃣ Consulta pelo intervalo em 'createdAt' (fallback)
  if (!docEncontrado) {
    try {
      const snap = await col
        .where("createdAt", ">=", inicio)
        .where("createdAt", "<=", fim)
        .limit(1)
        .get();
      if (!snap.empty) docEncontrado = snap.docs[0];
    } catch (err) {
      console.warn("⚠️ Erro na consulta por 'createdAt':", err);
    }
  }

  // 3️⃣ Se não achou, retorna
  if (!docEncontrado) {
    return { existeHoje: false };
  }

  const data = docEncontrado.data() as any;
  console.log(`✅ Devocional encontrado: "${data.titulo ?? "(sem título)"}"`);

  // ============================
  // ✅ BUSCAR TOKENS DOS DEVICES LOGADOS (igual versículo)
  // ============================

  console.log("[DEVOCIONAL] buscando usuarios...");
  const usersSnap = await db.collection("usuarios").get();
  console.log("[DEVOCIONAL] usuarios encontrados:", usersSnap.size);

  const uids = usersSnap.docs.map((d) => d.id);

  console.log("[DEVOCIONAL] buscando devices logados por usuario (sem collectionGroup)...");
  const tokensNested = await mapWithConcurrency(uids, 10, async (uid) => {
    const devSnap = await db
      .collection("usuarios")
      .doc(uid)
      .collection("devices")
      .where("isLoggedIn", "==", true)
      .get();

    return devSnap.docs.map((d) => d.data()?.expoToken).filter(isValidExpoToken);
  });

  const tokens = tokensNested.flat();
  const uniqueTokens = Array.from(new Set(tokens));
  console.log("[DEVOCIONAL] tokens validos (unicos):", uniqueTokens.length);

  if (uniqueTokens.length === 0) {
    console.warn("⚠️ Nenhum token válido encontrado (devices logados).");
    return { existeHoje: true, enviouNotificacao: false, motivo: "sem_tokens" };
  }

  // 📜 Montar mensagem com primeiro parágrafo do conteúdo
  const primeiroParagrafo =
    Array.isArray(data.paragrafos) && data.paragrafos.length > 0
      ? String(data.paragrafos[0] ?? "")
      : String(data.conteudo?.split("\n")[0] ?? "");

  const body = safeBody(
    `${primeiroParagrafo}${data.referencia ? ` (${data.referencia})` : ""}`,
    220
  );

  const title = safeBody(`📖 Devocional: ${data.titulo || "Novo Devocional"}`, 60);

  const messages = uniqueTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: {
      type: "devocional",
      devocionalId: docEncontrado!.id,
      dataISO: hojeISO,
    },
  }));

  // 📤 Enviar notificações via Expo (em chunks de 100, igual versículo)
  const chunkSize = 100;
  const results: any[] = [];

  try {
    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = messages.slice(i, i + chunkSize);

      console.log(
        `[DEVOCIONAL] enviando chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(
          messages.length / chunkSize
        )} (${chunk.length} msgs)`
      );

      const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      const status = expoResponse.status;
      const payload = await expoResponse.json().catch(async () => ({
        error: "non-json-response",
        status,
        raw: (await expoResponse.text()).slice(0, 500),
      }));

      if (status < 200 || status >= 300) {
        console.error("[DEVOCIONAL] Expo retornou erro:", status, payload);
      }

      results.push({ status, payload });
    }

    console.log("📤 Notificação devocional enviada (chunks).");

    return {
      existeHoje: true,
      enviouNotificacao: true,
      id: docEncontrado.id,
      sent: uniqueTokens.length,
      expoResult: results,
    };
  } catch (error) {
    console.error("❌ Erro ao enviar notificação devocional:", error);
    return { existeHoje: true, enviouNotificacao: false, erro: String(error) };
  }
}
