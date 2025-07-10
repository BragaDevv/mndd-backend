import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { htmlToText } from "html-to-text";

export async function extrairEstudoHandler(req: Request, res: Response) {
  const { url, tema: temaEnviado } = req.body;

  if (!url || !url.includes("estudosgospel.com.br")) {
    return res.status(400).json({ error: "URL inválida ou não suportada." });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Limpar título
    let titulo = doc.querySelector("h1")?.textContent?.trim() || "Estudo Sem Título";
    titulo = titulo.replace(/^Estudo Bíblico[\s:-]*/i, "").trim();

    const tema = temaEnviado?.trim() || titulo.split("–")[0]?.trim() || "Geral";

    // Extrair e limpar conteúdo
    const conteudoDiv = doc.querySelector(".com-content-article__body");
    let paragrafos = htmlToText(conteudoDiv?.innerHTML || "", {
      wordwrap: false,
      selectors: [{ selector: "a", format: "skip" }],
    })
      .split("\n")
      .map((p) => p.trim())
      .filter(
        (p) =>
          p.length > 20 &&
          !/^autor[:\-]/i.test(p) &&
          !p.toLowerCase().includes("divulgação") &&
          !p.toLowerCase().startsWith("| autor")
      );



    // Remover parágrafo duplicado do título
    if (
      paragrafos.length > 0 &&
      paragrafos[0].toLowerCase().includes(titulo.toLowerCase())
    ) {
      paragrafos.shift();
    }

    // Destacar palavras-chave
    const palavrasChave = ["Jesus", "Deus", "Espírito Santo", "fé", "graça"];
    const referenciasRegex = /\b(\d?\s?[A-Za-z]{2,}\s?\d{1,3}[:.]\d{1,3})\b/g; // ex: João 3:16, Mt 5.9

    paragrafos = paragrafos.map((p) => {
      let texto = p;

      // Negrito para palavras-chave
      palavrasChave.forEach((palavra) => {
        const regex = new RegExp(`\\b(${palavra})\\b`, "gi");
        texto = texto.replace(regex, "*$1*");
      });

      // Negrito para referências bíblicas
      texto = texto.replace(referenciasRegex, "*$1*");

      return texto;
    });

    const data = new Date().toISOString();

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      paragrafos, // apenas este campo agora
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      urlOriginal: url,
      dataPublicacao: data,
    });

    return res.status(200).json({ success: true, titulo, tema, paragrafos });
  } catch (error) {
    console.error("❌ Erro ao extrair estudo:", error);
    return res.status(500).json({ error: "Erro ao processar o estudo." });
  }
}
