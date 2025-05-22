import express, { Request, Response } from "express";
import admin from "firebase-admin";
import bodyParser from "body-parser";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// ✅ Verifica a variável de ambiente
const jsonString = process.env.GOOGLE_CREDENTIALS;
if (!jsonString) {
  console.error("❌ GOOGLE_CREDENTIALS não definida.");
  process.exit(1);
}

// ✅ Parse das credenciais
let serviceAccount: admin.ServiceAccount;
try {
  serviceAccount = JSON.parse(jsonString);
} catch (error) {
  console.error("❌ Erro ao fazer parse das credenciais:", error);
  process.exit(1);
}

// ✅ Inicializa o Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin inicializado.");
}

// ✅ Rota principal para envio
app.post("/send", async (req: Request, res: Response) => {
  const { title, body, image } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "Campos 'title' e 'body' são obrigatórios." });
  }

  try {
    // 🔄 Usa a coleção correta agora: pushTokens
    const snapshot = await admin.firestore().collection("pushTokens").get();

    const tokens = snapshot.docs
      .map((doc: QueryDocumentSnapshot) => doc.data().token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, message: "Nenhum token encontrado." });
    }

    const message = {
      notification: { title, body, image },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Notificação enviada para ${tokens.length} dispositivos.`);
    res.json({ success: true, response });
  } catch (error) {
    console.error("❌ Erro ao enviar notificação:", error);
    res.status(500).json({ error: "Erro ao enviar notificação." });
  }
});

// ✅ Porta dinâmica para Render ou local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});
