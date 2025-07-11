import { OpenAI } from "openai";
import fetch from "node-fetch";
import { htmlToText } from "html-to-text";
import admin from "firebase-admin";

export const salvarDevocionalDiario = async () => {
  try {
    // 1. Buscar HTML da página fixa
    const response = await fetch("https://bibliotecadopregador.com.br/devocional-diario");
    const html = await response.text();

    // 2. Limpar HTML para extrair texto puro
    const textoLimpo = htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: "a", format: "skip" },
        { selector: "img", format: "skip" },
        { selector: "button", format: "skip" },
        { selector: "nav", format: "skip" },
      ],
    });

    const textoLimitado = textoLimpo.slice(0, 4000); // limite de entrada para IA

    // 3. Enviar para OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `Você é um assistente devocional cristão. Com base no conteúdo fornecido, extraia:
1. Um título curto,
2. A referência bíblica principal (ex: João 3:16),
3. Um devocional com no máximo 4 parágrafos curtos.
Responda em JSON no formato: { titulo, referencia, paragrafos }`,
        },
        {
          role: "user",
          content: textoLimitado,
        },
      ],
      temperature: 0.7,
    });

    const resultado = completion.choices[0].message?.content || "";
    const json = JSON.parse(resultado);

    // 4. Salvar no Firestore
    const hoje = new Date().toISOString().split("T")[0];

    await admin.firestore().collection("devocional_diario").doc("hoje").set({
      ...json,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      data: hoje,
    });

    console.log("✅ Devocional diário salvo com sucesso.");
  } catch (error) {
    console.error("❌ Erro ao salvar devocional diário:", error);
  }
};

