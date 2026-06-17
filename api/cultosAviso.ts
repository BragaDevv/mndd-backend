// api/cultosAviso.ts
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
  const chunks = chunkArray(messages, 100); // Expo recomenda até 100
  const results: any[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    console.log(
      `[CULTO AVISO] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
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
      console.error("[CULTO AVISO] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

export default async function cultosAvisoHandler(_req: Request, res: Response) {
  console.log("🔔 Verificando cultos para avisar...");

  const agora = new Date();
  // Mantendo seu padrão: ajustar manualmente para UTC-3
  agora.setHours(agora.getHours() - 3);
  console.log("🕓 Agora (ajustada):", agora.toLocaleString("pt-BR"));

  try {
    const snapshot = await admin.firestore().collection("cultos").get();
    console.log(`📥 Cultos encontrados: ${snapshot.size}`);

    if (snapshot.empty) {
      console.log("📭 Nenhum culto encontrado na coleção.");
      return res.status(200).json({ message: "Nenhum culto agendado." });
    }

    // ✅ IMPORTANTÍSSIMO: incluir id do doc (para marcar aviso enviado)
    const cultos = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    for (const culto of cultos) {
      if (!culto.data || !culto.horario) {
        console.log("⚠️ Culto ignorado: dados incompletos.");
        continue;
      }

      // ✅ DEDUPE: se já avisou esse culto, não envia de novo
      if (culto.aviso2hEnviadoEm) {
        console.log("↩️ Culto já avisado (2h). Pulando:", culto.id);
        continue;
      }

      // Interpretação da data
      let ano: number, mes: number, dia: number;

      if (typeof culto.data === "string" && culto.data.includes("/")) {
        [dia, mes, ano] = culto.data.trim().split("/").map(Number);
      } else if (typeof culto.data === "string" && culto.data.includes("-")) {
        [ano, mes, dia] = culto.data.trim().split("-").map(Number);
      } else {
        console.log("⚠️ Formato de data desconhecido:", culto.data);
        continue;
      }

      const [hora, minuto] = String(culto.horario).trim().split(":").map(Number);

      if (
        isNaN(dia) ||
        isNaN(mes) ||
        isNaN(ano) ||
        isNaN(hora) ||
        isNaN(minuto)
      ) {
        console.log("⚠️ Culto ignorado: data ou horário inválido.");
        continue;
      }

      const dataCulto = new Date(ano, mes - 1, dia, hora, minuto);
      if (isNaN(dataCulto.getTime())) {
        console.log(
          "🚨 Erro ao interpretar data. Data bruta:",
          `${dia}/${mes}/${ano} ${hora}:${minuto}`
        );
        continue;
      }

      const diff = (dataCulto.getTime() - agora.getTime()) / 60000;

      console.log(`📆 Culto: ${culto.tipo} às ${culto.horario} em ${culto.data}`);
      console.log(`🗓️ Data completa interpretada: ${dataCulto.toLocaleString("pt-BR")}`);
      console.log(`⏱️ Diferença em minutos: ${diff.toFixed(2)}`);

      // ✅ se já passou, ignora
      if (diff < 0) {
        continue;
      }

      // ✅ janela original (2h antes)
      if (diff >= 115 && diff <= 125) {
        console.log("✅ Culto dentro do intervalo de envio de notificação!");

        // pega tokens de TODOS os DEVICES LOGADOS em push_devices
        const devicesSnap = await admin
          .firestore()
          .collection("push_devices")
          .where("isLoggedIn", "==", true)
          .get();

        const tokens = devicesSnap.docs
          .map((d) => d.data()?.expoToken)
          .filter(isValidExpoToken);

        const uniqueTokens = Array.from(new Set(tokens));

        console.log("[CULTO AVISO] devices logados encontrados:", devicesSnap.size);
        console.log("[CULTO AVISO] tokens válidos (únicos):", uniqueTokens.length);

        if (uniqueTokens.length === 0) {
          console.log("⚠️ Nenhum token válido encontrado em push_devices (logados).");
          continue;
        }

        const messages = uniqueTokens.map((token) => ({
          to: token,
          sound: "default",
          title: "🔔 Hoje tem Culto!",
          body: `${culto.tipo || "Culto"} 📍 ${culto.local || "igreja"}`,
          data: { type: "culto", screen: "Igreja" },
        }));

        const expoResult = await sendExpoInChunks(messages);
        console.log("📨 Notificações enviadas (chunks):", expoResult.length);

        // ✅ MARCA COMO AVISADO (pra não duplicar no próximo cron)
        await admin
          .firestore()
          .collection("cultos")
          .doc(culto.id)
          .set(
            {
              aviso2hEnviadoEm: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

        console.log("✅ aviso2hEnviadoEm salvo no culto:", culto.id);
      } else {
        console.log("❌ Fora do intervalo.");
      }
    }

    return res.status(200).json({ message: "Verificação de cultos concluída." });
  } catch (err) {
    console.error("❌ Erro ao processar cultos:", err);
    return res.status(500).json({ error: "Erro interno ao verificar cultos." });
  }
}
