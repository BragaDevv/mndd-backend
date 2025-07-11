import { OpenAI } from "openai";
import admin from "firebase-admin";

export const salvarDevocionalDiario = async () => {
  try {
    // 1. Obter dia da semana em pt-BR com timeZone correto
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      timeZone: "America/Sao_Paulo",
    });
    const diaSemana = formatter.format(new Date()).toLowerCase(); // ex: "terça-feira"

    // 2. Tabela segura de temas por dia da semana
    const temasPorDia: { [key: string]: string } = {
      domingo: "Adoração",
      "segunda-feira": "Fé",
      "terça-feira": "Família",
      "quarta-feira": "Oração",
      "quinta-feira": "Propósito",
      "sexta-feira": "Santidade e Obediência",
      sábado: "Descanso e Confiança",
    };

    // 3. Tema baseado no dia
    const tema = temasPorDia[diaSemana] || "Vida Cristã";

    // 3. Gerar devocional com IA
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

    // 4. Formatar data como yyyy-mm-dd
    const dataFormatada = new Date()
      .toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
      .replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");

    // 5. Salvar no Firestore
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
  } catch (error) {
    console.error("❌ Erro ao gerar devocional diário:", error);
  }
};
