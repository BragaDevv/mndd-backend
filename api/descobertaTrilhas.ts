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
      `[DESCOBERTA-TRILHAS] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
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
      console.error("[DESCOBERTA-TRILHAS] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

type Trilha = {
  screen: string;
  mensagens: { title: string; body: string }[];
};

// 5 telas × 3 mensagens cada. A ordem das mensagens (msg[0] de todas,
// depois msg[1] de todas, etc.) é montada no CATALOGO para intercalar as
// telas ao longo dos dias — nunca cai a mesma seção em dias seguidos.
const TRILHAS: Trilha[] = [
  {
    screen: "PlanoLeitura",
    mensagens: [
      {
        title: "📅 Que tal ler a Bíblia toda?",
        body: "Nosso Plano de Leitura te guia capítulo por capítulo, sem pressa. Toque e comece o seu hoje!",
      },
      {
        title: "🔥 Não perca a sequência!",
        body: "O Plano de Leitura organiza sua jornada na Palavra dia após dia. Vem continuar a sua!",
      },
      {
        title: "📖 Bíblia em 1 ano",
        body: "Já pensou em ler a Bíblia inteira? O Plano de Leitura torna isso possível. Bora começar?",
      },
    ],
  },
  {
    screen: "DicionarioConceitos",
    mensagens: [
      {
        title: "📚 Já viu nosso Dicionário?",
        body: "Graça, justificação, aliança... entenda os conceitos da fé de um jeito simples. Toque pra explorar!",
      },
      {
        title: "🤔 O que significa 'santificação'?",
        body: "Descubra no Dicionário de Conceitos do app. Tem muita coisa boa te esperando!",
      },
      {
        title: "💡 Aprenda algo novo hoje",
        body: "Nosso Dicionário Bíblico explica os grandes temas da Palavra. Dá uma olhada!",
      },
    ],
  },
  {
    screen: "ProfeciasMessianicas",
    mensagens: [
      {
        title: "✨ Profecias sobre Jesus",
        body: "Já viu como o Antigo Testamento anunciou Cristo séculos antes? Explore as Profecias Messiânicas!",
      },
      {
        title: "📜 As promessas se cumpriram",
        body: "Cada profecia messiânica e seu cumprimento, lado a lado. Você precisa ver essa seção!",
      },
      {
        title: "🔭 Do Antigo ao Novo Testamento",
        body: "Veja Deus tecendo a vinda de Jesus em toda a Escritura. Toque e confira as profecias!",
      },
    ],
  },
  {
    screen: "Personagens",
    mensagens: [
      {
        title: "👤 Já viu nossa seção de Personagens?",
        body: "Conheça a história de Davi, Moisés, Ester e muitos outros. Toque pra começar!",
      },
      {
        title: "📖 Histórias que inspiram",
        body: "Mergulhe na vida dos personagens bíblicos e nas lições que eles deixaram. Vem ver!",
      },
      {
        title: "✨ De pastor a rei",
        body: "A jornada dos grandes nomes da Bíblia está na seção de Personagens. Explore agora!",
      },
    ],
  },
  {
    screen: "Doutrinas",
    mensagens: [
      {
        title: "✝️ O que você crê?",
        body: "Entenda as principais doutrinas da fé cristã de forma clara. Explore a seção de Doutrinas!",
      },
      {
        title: "📕 Fortaleça sua fé",
        body: "Salvação, Trindade, graça... estude as Doutrinas fundamentais no app. Toque pra ver!",
      },
      {
        title: "🎓 Conheça a fé que você professa",
        body: "A seção de Doutrinas te ajuda a entender o que a Bíblia ensina. Dá uma conferida!",
      },
    ],
  },
];

// Catálogo linear intercalado: rodada 0 (msg[0] de cada tela), rodada 1, rodada 2.
// Resultado: 15 pushes, uma tela diferente a cada dia, ciclo de 15 dias.
const CATALOGO: { screen: string; title: string; body: string }[] = [];
for (let rodada = 0; rodada < 3; rodada++) {
  for (const trilha of TRILHAS) {
    const m = trilha.mensagens[rodada];
    if (m) CATALOGO.push({ screen: trilha.screen, title: m.title, body: m.body });
  }
}

/** Número do dia (estável) no fuso de São Paulo, para rotação determinística. */
function diaIndexSP(): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Push diário de descoberta das trilhas de estudo.
 * Rotaciona pelo CATALOGO (1 mensagem por dia, intercalando as telas).
 *
 * Body/query opcionais (debug):
 *  - index: força uma mensagem específica do CATALOGO (0..14)
 *  - onlyUid: envia apenas para os devices desse uid
 */
export default async function descobertaTrilhasHandler(
  req: Request,
  res: Response
) {
  try {
    const rawIndex = req.body?.index ?? req.query?.index;
    const idx =
      rawIndex != null && !isNaN(Number(rawIndex))
        ? ((Number(rawIndex) % CATALOGO.length) + CATALOGO.length) %
          CATALOGO.length
        : diaIndexSP() % CATALOGO.length;

    const escolhida = CATALOGO[idx];

    const onlyUid = req.body?.onlyUid
      ? String(req.body.onlyUid)
      : req.query?.onlyUid
        ? String(req.query.onlyUid)
        : null;

    console.log(
      `📲 [DESCOBERTA-TRILHAS] index=${idx} screen=${escolhida.screen} ` +
        (onlyUid ? `(teste onlyUid=${onlyUid})` : "")
    );

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

    console.log("[DESCOBERTA-TRILHAS] devices logados:", devicesSnap.size);
    console.log(`📲 Tokens válidos (únicos): ${uniqueTokens.length}`);

    if (uniqueTokens.length === 0) {
      return res.status(200).json({
        message: "Sem tokens válidos (logados).",
        index: idx,
        screen: escolhida.screen,
      });
    }

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: escolhida.title,
      body: escolhida.body,
      data: { type: "descoberta_trilha", screen: escolhida.screen },
    }));

    const expoResult = await sendExpoInChunks(messages);

    return res.status(200).json({
      message: "Push de descoberta enviado para todos os devices logados.",
      index: idx,
      screen: escolhida.screen,
      title: escolhida.title,
      sent: uniqueTokens.length,
      expoChunks: expoResult.length,
    });
  } catch (error) {
    console.error("❌ Erro ao enviar push de descoberta de trilhas:", error);
    return res
      .status(500)
      .json({ error: "Erro ao enviar push de descoberta de trilhas." });
  }
}
