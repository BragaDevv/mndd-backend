import express, { Request, Response } from 'express';
import admin from 'firebase-admin';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

const jsonString = process.env.GOOGLE_CREDENTIALS;
if (!jsonString) throw new Error("GOOGLE_CREDENTIALS não definida.");

const serviceAccount = JSON.parse(jsonString);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

app.post('/send', async (req: Request, res: Response) => {
  const { title, body, image } = req.body;

  try {
    const snapshot = await admin.firestore().collection('tokens').get();
    const tokens = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data().token);


    const message = {
      notification: { title, body, image },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    res.json({ success: true, response });
  } catch (error) {
    console.error('Erro ao enviar:', error);
    res.status(500).json({ error: 'Erro ao enviar notificação.' });
  }
});

app.listen(3000, () => {
  console.log('API online na porta 3000');
});
