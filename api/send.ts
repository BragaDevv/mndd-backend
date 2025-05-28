import express, { Request, Response } from "express";
import admin from "firebase-admin";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";
import versiculoHoraHandler from "./versiculoHora";
import versiculoHandler from "./versiculo";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Inicialização do Firebase Admin
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

// ✅ ROTA /send para envio de notificações personalizadas
app.post("/send", async (req: Request, res: Response) => {
  const { title, body, image, to, tokens } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "Campos 'title' e 'body' são obrigatórios." });
  }

  try {
    let expoTokens: string[] = [];

    // Prioridade para tokens passados no corpo da requisição
    if (Array.isArray(tokens)) {
      expoTokens = tokens.filter(
        (t) => typeof t === "string" && t.startsWith("ExponentPushToken[")
      );
    } else if (typeof to === "string" && to.startsWith("ExponentPushToken[")) {
      expoTokens = [to];
    } else {
      // 🔍 Buscar todos tokens da coleção 'usuarios'
      const snapshot = await admin.firestore().collection("usuarios").get();
      expoTokens = snapshot.docs
        .map((doc) => doc.data().expoToken)
        .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));
    }

    if (expoTokens.length === 0) {
      console.warn("⚠️ Nenhum token válido encontrado.");
      return res.status(200).json({ success: true, sent: 0, message: "Nenhum token válido encontrado." });
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

    res.json({ success: true, sent: expoTokens.length, expoResult: result });
  } catch (error) {
    console.error("❌ Erro ao enviar notificação:", error);
    res.status(500).json({ error: "Erro ao enviar notificação." });
  }
});

// ✅ ROTA /versiculo (versículo do dia)
app.post("/versiculo", versiculoHandler);

// ✅ ROTA /versiculo-hora (POST e GET)
app.all("/versiculo-hora", versiculoHoraHandler);
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

import { checarEEnviarVersiculo } from "./versiculoCron";

// Executa a checagem a cada minuto
setInterval(checarEEnviarVersiculo, 60 * 1000);

// 🔥 Porta dinâmica (Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});
