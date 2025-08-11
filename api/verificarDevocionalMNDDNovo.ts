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
    if (!snap.empty) {
      docEncontrado = snap.docs[0];
    }
  } catch (err) {
    console.warn("⚠️ Erro na consulta por 'data':", err);
  }

  // 2️⃣ Consulta pelo intervalo em 'createdAt' (caso não tenha achado pelo campo 'data')
  if (!docEncontrado) {
    try {
      const snap = await col
        .where("createdAt", ">=", inicio)
        .where("createdAt", "<=", fim)
        .limit(1)
        .get();
      if (!snap.empty) {
        docEncontrado = snap.docs[0];
      }
    } catch (err) {
      console.warn("⚠️ Erro na consulta por 'createdAt':", err);
    }
  }

  // 3️⃣ Se não achou, retorna
  if (!docEncontrado) {
    return { existeHoje: false };
  }

  const data = docEncontrado.data();
  console.log(`✅ Devocional encontrado: "${data.titulo}"`);

  // 🚀 Buscar todos os tokens dos usuários
  const snapshotUsuarios = await db.collection("usuarios").get();
  const tokens = snapshotUsuarios.docs
    .map((doc) => doc.data().expoToken)
    .filter(
      (t) => typeof t === "string" && t.startsWith("ExponentPushToken")
    );

  if (tokens.length === 0) {
    console.warn("⚠️ Nenhum token válido encontrado para envio do devocional.");
    return { existeHoje: true, enviouNotificacao: false, motivo: "sem_tokens" };
  }

  // 📜 Montar mensagem com primeiro parágrafo do conteúdo
  const primeiroParagrafo =
    Array.isArray(data.paragrafos) && data.paragrafos.length > 0
      ? data.paragrafos[0]
      : (data.conteudo?.split("\n")[0] || "");

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default",
    title: `📖 Devocional: ${data.titulo || "Novo Devocional"}`,
    body: `${primeiroParagrafo} (${data.referencia || ""})`,
  }));

  // 📤 Enviar notificações via Expo
  try {
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoResult = await expoResponse.json();
    console.log("📤 Notificação enviada:", expoResult);

    return { existeHoje: true, enviouNotificacao: true, id: docEncontrado.id };
  } catch (error) {
    console.error("❌ Erro ao enviar notificação:", error);
    return { existeHoje: true, enviouNotificacao: false, erro: String(error) };
  }
}
