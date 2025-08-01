import { OpenAI } from "openai";
import admin from "firebase-admin";
import fetch from "node-fetch";

export const salvarDevocionalDiario = async () => {
  try {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      timeZone: "America/Sao_Paulo",
    });
    const diaSemana = formatter.format(new Date()).toLowerCase();

    const temasPorDia: { [key: string]: string } = {
      domingo: "Adoração",
      "segunda-feira": "Fé",
      "terça-feira": "Família",
      "quarta-feira": "Oração",
      "quinta-feira": "Propósito",
      "sexta-feira": "Santidade e Obediência",
      sábado: "Descanso e Confiança",
    };

    const tema = temasPorDia[diaSemana] || "Vida Cristã";

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `Você é um assistente devocional cristão. Crie um devocional original e inspirador com base no tema do dia.

Use esse formato:
- Um título curto,
- Uma referência bíblica real (ex: João 3:16),
- Um devocional com até 4 parágrafos curtos e práticos.

Escreva para cristãos de todas as idades. Tema do dia: ${tema}.
Responda apenas no formato JSON: { titulo, referencia, paragrafos }`,
        },
        {
          role: "user",
          content: "Crie o devocional do dia de hoje.",
        },
      ],
    });

    const resultado = completion.choices[0].message?.content || "";
    const json = JSON.parse(resultado);

    const dataFormatada = new Date()
      .toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
      .replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");

    await admin
      .firestore()
      .collection("devocional_diario")
      .doc("hoje")
      .set({
        ...json,
        tema,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        data: dataFormatada,
      });

    console.log(`✅ Devocional do tema "${tema}" salvo com sucesso.`);

    // 🚀 Enviar notificação push com título e primeiro parágrafo
    const snapshot = await admin.firestore().collection("usuarios").get();
    const tokens = snapshot.docs
      .map((doc) => doc.data().expoToken)
      .filter(
        (t) => typeof t === "string" && t.startsWith("ExponentPushToken")
      );

    if (tokens.length === 0) {
      console.warn(
        "⚠️ Nenhum token válido encontrado para envio do devocional."
      );
      return;
    }

    const primeiroParagrafo = json.paragrafos[0] || "";

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: `📖 Devocional: ${json.titulo}`,
      body: `${primeiroParagrafo} (${json.referencia})`,
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

    const expoResult = await expoResponse.json();
    console.log("📤 Notificação enviada:", expoResult);
  } catch (error) {
    console.error("❌ Erro ao gerar ou enviar devocional diário:", error);
  }
};
