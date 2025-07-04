import express, { Request, Response } from "express";
import admin from "firebase-admin";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import OpenAI from "openai";

import versiculoHoraHandler from "./versiculoHora";
import versiculoHandler from "./versiculo";
import { checarEnviarVersiculo } from "./versiculoCron";
import { versiculoDiaHandler } from "./versiculoDia";
import spotifyHandler from "./spotify";
import rankingHandler from "./ranking";
import cultosAvisoHandler from "./cultosAviso";
import cifraHandler from "./cifra";



dotenv.config();

const app = express();
app.use(bodyParser.json());

// 🔐 Inicialização do Firebase Admin
const jsonString = process.env.GOOGLE_CREDENTIALS;
if (!jsonString) {
  console.error("❌ GOOGLE_CREDENTIALS não definida.");
  process.exit(1);
}

let serviceAccount: admin.ServiceAccount;
try {
  serviceAccount = JSON.parse(jsonString);
} catch (error) {
  console.error("❌ Erro ao fazer parse das credenciais:", error);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin inicializado.");
}

// ✅ ROTA /send - Envia notificação personalizada
app.post("/send", async (req: Request, res: Response) => {
  const { title, body, image, to, tokens } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "Campos 'title' e 'body' são obrigatórios." });
  }

  try {
    let expoTokens: string[] = [];

    if (Array.isArray(tokens)) {
      expoTokens = tokens.filter(
        (t) => typeof t === "string" && t.startsWith("ExponentPushToken[")
      );
    } else if (typeof to === "string" && to.startsWith("ExponentPushToken[")) {
      expoTokens = [to];
    } else {
      const snapshot = await admin.firestore().collection("usuarios").get();
      expoTokens = snapshot.docs
        .map((doc) => doc.data().expoToken)
        .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));
    }

    if (expoTokens.length === 0) {
      console.warn("⚠️ Nenhum token válido encontrado.");
      return res.status(200).json({ success: true, sent: 0 });
    }

    const messages = expoTokens.map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      ...(image ? { image } : {}),
    }));

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await expoResponse.json();
    console.log("📨 Notificações enviadas:", result);

    return res.json({ success: true, sent: expoTokens.length, expoResult: result });
  } catch (error) {
    console.error("❌ Erro ao enviar notificação:", error);
    return res.status(500).json({ error: "Erro ao enviar notificação." });
  }
});

// ✅ Versículo do Dia - manual
app.post("/versiculo", versiculoHandler);

// ✅ Salvar horário do versículo (POST e GET)
app.all("/versiculo-hora", versiculoHoraHandler);

// ✅ Apenas GET (para segurança e fallback)
app.get("/versiculo-hora", async (_req, res) => {
  try {
    const doc = await admin.firestore().collection("configuracoes").doc("versiculo").get();
    const data = doc.data();
    if (data?.hora) {
      return res.status(200).json({ hora: data.hora });
    } else {
      return res.status(404).json({ error: "Horário não encontrado" });
    }
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar horário" });
  }
});

// ✅ ROTA Notif Cultos
app.get("/cultos/avisar", cultosAvisoHandler);

// ✅ ROTA Spotify
app.get("/spotify/louvores", spotifyHandler);

// ✅ ROTA Cifra
app.all("/cifras", cifraHandler); // cuida de GET e POST (mais flexível)

// ✅ ROTA Ranking
app.get("/ranking/check", rankingHandler);

// ✅ ROTA auxiliar para forçar a checagem externa
app.get("/checar", async (_req, res) => {
  await checarEnviarVersiculo();
  return res.send("Versículo checado.");
});

// ✅ ROTA GET VERSICULO DO DIA
app.get("/api/versiculo-dia", versiculoDiaHandler);

// ✅ Integração com OpenAI protegida
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

app.post("/api/openai/ask", async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt obrigatório." });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente bíblico cristão do Ministério Nascido de Deus (MNDD). " +
            "Responda de forma clara, simples e acolhedora, citando versículos quando apropriado. " +
            "Mantenha-se estritamente no contexto bíblico. " +
            "Se perguntarem sobre cultos ou eventos da igreja, informe que pode verificar os próximos eventos. " +
            "Para informações sobre cultos, diga apenas: 'Por favor, pergunte especificamente sobre os cultos para que eu possa verificar.'",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const result = completion.choices[0]?.message?.content;
    return res.status(200).json({ result });
  } catch (error) {
    console.error("Erro ao consultar OpenAI:", error);
    return res.status(500).json({ error: "Erro ao consultar OpenAI." });
  }
});

// 🚀 Inicializa o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});
