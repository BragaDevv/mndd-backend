import { OpenAI } from "openai";
import admin from "firebase-admin";

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
        { role: "user", content: "Crie o devocional do dia de hoje." },
      ],
    });

    const resultado = completion.choices[0].message?.content || "{}";
    let json: any;
    try {
      json = JSON.parse(resultado);
    } catch {
      throw new Error("Resposta da IA não veio em JSON válido.");
    }

    const dataFormatada = new Date()
      .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
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
    // ✅ Sem envio de notificação push.
  } catch (error) {
    console.error("❌ Erro ao gerar/salvar devocional diário:", error);
  }
};
