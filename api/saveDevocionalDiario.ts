import { OpenAI } from "openai";
import admin from "firebase-admin";

function hojeISO_SP(): string {
  // gera yyyy-MM-dd considerando SP
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
}

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

    const dataId = hojeISO_SP(); // ✅ yyyy-MM-dd

    const payload = {
      ...json,
      tema,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      data: dataId, // ✅ mantém no mesmo formato do docId
    };

    const col = admin.firestore().collection("devocional_diario");

    // ✅ 1) salva o histórico do dia (NUNCA sobrescreve outros dias)
    await col.doc(dataId).set(payload, { merge: true });

    // ✅ 2) opcional: ponteiro "hoje" (sempre reflete o dia atual)
    await col.doc("hoje").set(payload, { merge: true });

    console.log(`✅ Devocional "${tema}" salvo em devocional_diario/${dataId}`);
  } catch (error) {
    console.error("❌ Erro ao gerar/salvar devocional diário:", error);
  }
};
