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

// grupoId (Firestore) -> nome da rota da tela do grupo no app
const GROUP_SCREENS: Record<string, string> = {
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

async function sendExpoInChunks(messages: any[]) {
  const chunks = chunkArray(messages, 100);
  const results: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    console.log(
      `[GRUPO-SUGESTAO] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
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
      console.error("[GRUPO-SUGESTAO] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

export default async function grupoSugestaoPushHandler(req: Request, res: Response) {
  try {
    const grupoId    = String(req.body?.grupoId ?? "").trim();
    const grupoNome  = String(req.body?.grupoNome ?? "o grupo").trim();
    const sugeridoPor = req.body?.sugeridoPor ? String(req.body.sugeridoPor) : null;
    const nome       = String(req.body?.nome ?? "Alguém").trim();
    const titulo     = String(req.body?.titulo ?? "").trim();

    if (!grupoId) {
      return res.status(400).json({ error: "grupoId é obrigatório." });
    }

    console.log("🎵 Nova sugestão de louvor:", { grupoId, grupoNome, sugeridoPor, titulo });

    // 1) membros do grupo: usuarios com notificacoes.{grupoId} != null
    //    (mesmo critério usado pelo cron de digest dos grupos)
    const membrosSnap = await admin
      .firestore()
      .collection("usuarios")
      .where(`notificacoes.${grupoId}`, "!=", null)
      .get();

    const membrosUids = membrosSnap.docs
      .map((d) => d.id)
      .filter((id) => id !== sugeridoPor); // não notifica quem sugeriu

    console.log(`👥 Membros do grupo (fora o autor): ${membrosUids.length}`);

    if (membrosUids.length === 0) {
      return res.status(200).json({ message: "Sem outros membros para notificar.", grupoId });
    }

    // 2) tokens dos devices desses membros (push_devices where uid in chunks de 10)
    const tokens: string[] = [];
    for (let i = 0; i < membrosUids.length; i += 10) {
      const chunk = membrosUids.slice(i, i + 10);
      const devSnap = await admin
        .firestore()
        .collection("push_devices")
        .where("uid", "in", chunk)
        .get();
      devSnap.forEach((d) => {
        const t = d.data()?.expoToken;
        if (isValidExpoToken(t)) tokens.push(t);
      });
    }

    const uniqueTokens = Array.from(new Set(tokens));

    console.log(`📲 Tokens válidos (únicos): ${uniqueTokens.length}`);

    if (uniqueTokens.length === 0) {
      return res.status(200).json({ message: "Sem tokens válidos (logados).", grupoId });
    }

    const corpo = titulo
      ? `${nome} sugeriu: ${titulo}`
      : `${nome} adicionou uma nova sugestão`;

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: "default",
      title: `🎵 Nova sugestão em ${grupoNome}`,
      body: corpo,
      data: {
        type: "grupo_sugestao",
        grupoId,
        ...(GROUP_SCREENS[grupoId] ? { screen: GROUP_SCREENS[grupoId] } : {}),
      },
    }));

    console.log("🚀 Enviando push de sugestão para os membros logados...");

    const expoResult = await sendExpoInChunks(messages);

    return res.status(200).json({
      message: "Notificações enviadas aos membros do grupo.",
      grupoId,
      sent: uniqueTokens.length,
      expoChunks: expoResult.length,
    });
  } catch (error) {
    console.error("❌ Erro ao notificar sugestão de louvor:", error);
    return res.status(500).json({ error: "Erro ao processar sugestão de louvor." });
  }
}
