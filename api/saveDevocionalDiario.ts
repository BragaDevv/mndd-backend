import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import admin from "firebase-admin";

export const salvarDevocionalDiario = async () => {
  try {
    const response = await fetch(
      "https://bibliotecadopregador.com.br/devocional-diario"
    );
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const titulo =
      doc.querySelector(".titulo-devocional")?.textContent?.trim() ||
      "Título não encontrado";
    const referencia =
      doc.querySelector(".versiculo-devocional")?.textContent?.trim() ||
      "Referência não encontrada";

    const paragrafos: string[] = [];
    doc.querySelectorAll(".texto-devocional > p").forEach((p) => {
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

    const hoje = new Date().toISOString().split("T")[0];

    await admin
      .firestore()
      .collection("devocional_diario")
      .doc("hoje")
      .set({
        ...json,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        data: hoje,
      });

    console.log("✅ Devocional diário salvo com sucesso.");
  } catch (error) {
    console.error("❌ Erro ao salvar devocional diário:", error);
  }
};
