// api/eventosAviso.ts
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
      `[EVENTO AVISO] enviando chunk ${i + 1}/${chunks.length} (${chunk.length} msgs)`
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
      console.error("[EVENTO AVISO] Expo erro:", status, payload);
    }

    results.push({ status, payload, sent: chunk.length });
  }

  return results;
}

export default async function eventosAvisoHandler(_req: Request, res: Response) {
  console.log("🔔 Verificando eventos para avisar...");

  const agora = new Date();
  agora.setHours(agora.getHours() - 3); // Ajuste para UTC-3 (mantive seu padrão)
  console.log("🕓 Agora (ajustada):", agora.toLocaleString("pt-BR"));

  try {
    const snapshot = await admin.firestore().collection("eventos").get();
    console.log(`📥 Eventos encontrados: ${snapshot.size}`);

    if (snapshot.empty) {
      console.log("📭 Nenhum evento encontrado na coleção.");
      return res.status(200).json({ message: "Nenhum evento agendado." });
    }

    // ✅ agora inclui o id do doc (necessário para marcar "já avisado")
    const eventos = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    for (const evento of eventos) {
      if (!evento.data || !evento.horario) {
        console.log("⚠️ Evento ignorado: dados incompletos.");
        continue;
      }

      // ✅ dedupe: se já avisou, não manda de novo
      if (evento.aviso2hEnviadoEm) {
        console.log("↩️ Já avisado (2h) — pulando:", evento.id);
        continue;
      }

      // Interpretação da data
      let ano: number, mes: number, dia: number;
      if (typeof evento.data === "string" && evento.data.includes("/")) {
        [dia, mes, ano] = evento.data.trim().split("/").map(Number);
      } else if (typeof evento.data === "string" && evento.data.includes("-")) {
        [ano, mes, dia] = evento.data.trim().split("-").map(Number);
      } else {
        console.log("⚠️ Formato de data desconhecido:", evento.data);
        continue;
      }

      const [hora, minuto] = String(evento.horario).trim().split(":").map(Number);

      if (isNaN(dia) || isNaN(mes) || isNaN(ano) || isNaN(hora) || isNaN(minuto)) {
        console.log("⚠️ Evento ignorado: data ou horário inválido.");
        continue;
      }

      const dataEvento = new Date(ano, mes - 1, dia, hora, minuto);
      if (isNaN(dataEvento.getTime())) {
        console.log(
          "🚨 Erro ao interpretar data. Data bruta:",
          `${dia}/${mes}/${ano} ${hora}:${minuto}`
        );
        continue;
      }

      const diff = (dataEvento.getTime() - agora.getTime()) / 60000;

      console.log(`📆 Evento: ${evento.tipo} às ${evento.horario} em ${evento.data}`);
      console.log(`🗓️ Data completa interpretada: ${dataEvento.toLocaleString("pt-BR")}`);
      console.log(`⏱️ Diferença em minutos: ${diff.toFixed(2)}`);

      // ✅ evento já passou -> não processa
      if (diff < 0) {
        console.log("⏪ Evento já passou — ignorando.");
        continue;
      }

      // ✅ janela original
      if (diff >= 115 && diff <= 125) {
        console.log("✅ Evento dentro do intervalo de envio de notificação!");

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

        console.log("[EVENTO AVISO] devices logados encontrados:", devicesSnap.size);
        console.log("[EVENTO AVISO] tokens válidos (únicos):", uniqueTokens.length);

        if (uniqueTokens.length === 0) {
          console.log("⚠️ Nenhum token válido encontrado em push_devices (logados).");
          continue;
        }

        const messages = uniqueTokens.map((token) => ({
          to: token,
          sound: "default",
          title: "🔔 Não esqueça !",
          body: `${evento.tipo || "Evento"} 📍 ${evento.local || "igreja"}`,
        }));

        const expoResult = await sendExpoInChunks(messages);
        console.log("📨 Notificações enviadas (chunks):", expoResult.length);

        // ✅ marca como "já avisado" para não duplicar em execuções futuras
        await admin
          .firestore()
          .collection("eventos")
          .doc(evento.id)
          .set(
            { aviso2hEnviadoEm: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );

        console.log("✅ aviso2hEnviadoEm salvo no evento:", evento.id);
      } else {
        console.log("❌ Fora do intervalo.");
      }
    }

    return res.status(200).json({ message: "Verificação de eventos concluída." });
  } catch (err) {
    console.error("❌ Erro ao processar eventos:", err);
    return res.status(500).json({ error: "Erro interno ao verificar eventos." });
  }
}
