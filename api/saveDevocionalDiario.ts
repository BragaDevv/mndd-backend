import { JSDOM } from "jsdom";
import fetch from "node-fetch";
import admin from "firebase-admin";

export const salvarDevocionalDiario = async (somenteRetorno = false) => {
  try {
    const response = await fetch("https://bibliotecadopregador.com.br/devocional-diario");
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const titulo = doc.querySelector(".resumo-devocional")?.textContent?.trim() || "Título não encontrado";

    const referenciaBruta = doc.querySelector(".versiculo-devocional p")?.textContent?.trim() || "";
    const referencia = referenciaBruta.split("–").pop()?.trim() || "Referência não encontrada";

    const paragrafos: string[] = [];
    doc.querySelectorAll(".texto-devocional p").forEach((p) => {
      const texto = p.textContent?.trim();
      if (texto && texto.length > 30) {
        paragrafos.push(texto);
      }
    });

    const json = {
      titulo,
      referencia,
      paragrafos: paragrafos.slice(0, 4),
    };

    if (somenteRetorno) return json;

    const hoje = new Date().toISOString().split("T")[0];

    await admin.firestore().collection("devocional_diario").doc("hoje").set({
      ...json,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      data: hoje,
    });

    console.log("✅ Devocional diário salvo com sucesso.");
    return json;
  } catch (error) {
    console.error("❌ Erro ao salvar devocional diário:", error);
    throw error;
  }
};
