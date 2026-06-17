import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { getVersiculoDoDia } from "./versiculoDoDia";

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

// Nome PT → abbrev canônica (mesma do app em utils/bibliaVersiculos.ts).
// Usado para o deep-link abrir o capítulo com o versículo destacado.
const PT_TO_ABBREV: Record<string, string> = {
  "Gênesis": "gn", "Êxodo": "ex", "Levítico": "lv", "Números": "nm", "Deuteronômio": "dt",
  "Josué": "js", "Juízes": "jz", "Rute": "rt", "1 Samuel": "1sm", "2 Samuel": "2sm",
  "1 Reis": "1rs", "2 Reis": "2rs", "1 Crônicas": "1cr", "2 Crônicas": "2cr",
  "Esdras": "ed", "Neemias": "ne", "Ester": "et", "Jó": "jó", "Salmos": "sl",
  "Provérbios": "pv", "Eclesiastes": "ec", "Cantares": "ct", "Isaías": "is",
  "Jeremias": "jr", "Lamentações": "lm", "Ezequiel": "ez", "Daniel": "dn", "Oséias": "os",
  "Joel": "jl", "Amós": "am", "Obadias": "ob", "Jonas": "jn", "Miquéias": "mq", "Naum": "na",
  "Habacuque": "hc", "Sofonias": "sf", "Ageu": "ag", "Zacarias": "zc", "Malaquias": "ml",
  "Mateus": "mt", "Marcos": "mc", "Lucas": "lc", "João": "jo", "Atos": "atos",
  "Romanos": "rm", "1 Coríntios": "1co", "2 Coríntios": "2co", "Gálatas": "gl",
  "Efésios": "ef", "Filipenses": "fp", "Colossenses": "cl",
  "1 Tessalonicenses": "1ts", "2 Tessalonicenses": "2ts",
  "1 Timóteo": "1tm", "2 Timóteo": "2tm", "Tito": "tt", "Filêmon": "fm", "Hebreus": "hb",
  "Tiago": "tg", "1 Pedro": "1pe", "2 Pedro": "2pe",
  "1 João": "1jo", "2 João": "2jo", "3 João": "3jo", "Judas": "jd", "Apocalipse": "ap",
};

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

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  try {
    const versiculo = getVersiculoDoDia();

    console.log("[VERSICULO] buscando usuarios...");
    const usersSnap = await admin.firestore().collection("usuarios").get();
    console.log("[VERSICULO] usuarios encontrados:", usersSnap.size);

    const uids = usersSnap.docs.map((d) => d.id);

    console.log("[VERSICULO] buscando devices logados por usuario (sem collectionGroup)...");
    const tokensNested = await mapWithConcurrency(uids, 10, async (uid) => {
      const devSnap = await admin
        .firestore()
        .collection("usuarios")
        .doc(uid)
        .collection("devices")
        .where("isLoggedIn", "==", true)
        .get();

      return devSnap.docs.map((d) => d.data()?.expoToken).filter(isValidExpoToken);
    });

    const tokens = tokensNested.flat();
    const uniqueTokens = Array.from(new Set(tokens));
    console.log("[VERSICULO] tokens validos (unicos):", uniqueTokens.length);

    if (uniqueTokens.length === 0) {
      return res.status(200).json({
        success: true,
        sent: 0,
        message: "Nenhum token válido encontrado (devices logados).",
      });
    }

    const body = safeBody(
      `${versiculo.texto} (${versiculo.livro} ${versiculo.capitulo}:${versiculo.versiculo})`,
      220
    );

    // Deep-link: abre o capítulo com o versículo destacado (payload leve).
    // O app monta o capítulo localmente a partir do verseRef.
    const abbrev = PT_TO_ABBREV[versiculo.livro];
    const verseData = abbrev
      ? {
          type: "versiculo_dia",
          screen: "Versiculos",
          verseRef: {
            bookAbbrev: abbrev,
            chapterNumber: versiculo.capitulo,
            verseNumber: versiculo.versiculo,
          },
        }
      : { type: "versiculo_dia" };

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "📖 Versículo do Dia",
      body,
      data: verseData,
    }));

    const chunkSize = 100;
    const results: any[] = [];

    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = messages.slice(i, i + chunkSize);
      console.log(
        `[VERSICULOO] enviando chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(messages.length / chunkSize)} (${chunk.length} msgs)`
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
        console.error("[VERSICULO] Expo retornou erro:", status, payload);
      }

      results.push({ status, payload });
    }

    return res.status(200).json({
      success: true,
      sent: uniqueTokens.length,
      versiculo,
      expoResult: results,
    });
  } catch (error: any) {
    console.error("❌ Erro ao enviar versículo (raw):", error);
    return res.status(500).json({ error: "Erro interno ao enviar versículo." });
  }
}
