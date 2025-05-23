import express, { Request, Response } from "express";
import admin from "firebase-admin";
import bodyParser from "body-parser";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import dotenv from "dotenv";
import fetch from "node-fetch"; // ✅ necessário para chamadas HTTP

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Firebase Admin setup (mantém para acessar Firestore)
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

// ✅ NOVA ROTA usando Expo Push API
app.post("/send", async (req: Request, res: Response) => {
  const { title, body, image } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "Campos 'title' e 'body' são obrigatórios." });
  }

  try {
    const snapshot = await admin.firestore().collection("pushTokens").get();

    const tokens = snapshot.docs
      .map((doc: QueryDocumentSnapshot) => doc.data().token)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken["));

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, message: "Nenhum token válido encontrado." });
    }

    const messages = tokens.map((token) => ({
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
    console.log("📨 Expo Push Response:", result);

    res.json({ success: true, sent: tokens.length, expoResult: result });
  } catch (error) {
    console.error("❌ Erro ao enviar notificação:", error);
    res.status(500).json({ error: "Erro ao enviar notificação." });
  }
});

// Porta dinâmica (para Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});
