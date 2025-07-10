import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { htmlToText } from "html-to-text";

export async function extrairEstudoHandler(req: Request, res: Response) {
  const { url, tema: temaEnviado } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL não informada." });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    let titulo = "Estudo Sem Título";
    let conteudoHTML = "";

    if (url.includes("estudosgospel.com.br")) {
      // --------- SITE: estudosgospel.com.br ---------
      titulo = doc.querySelector("h1")?.textContent?.trim() || titulo;
      titulo = titulo.replace(/^Estudo Bíblico[\s:-]*/i, "").trim();
      conteudoHTML = doc.querySelector(".com-content-article__body")?.innerHTML || "";
    }

    else if (url.includes("bibliotecadopregador.com.br")) {
      // --------- SITE: bibliotecadopregador.com.br ---------
      titulo = doc.querySelector("h1.entry-title")?.textContent?.trim() || titulo;
      conteudoHTML =
        doc.querySelector("#the-post")?.innerHTML ||  // ✅ seletor novo
        doc.querySelector("div.td-post-content")?.innerHTML ||  // fallback antigo
        doc.querySelector("article")?.innerHTML || "";
    }

    else {
      return res.status(400).json({ error: "Este domínio ainda não é suportado." });
    }

    const tema = temaEnviado?.trim() || titulo.split("–")[0]?.trim() || "Geral";

    let paragrafos = htmlToText(conteudoHTML, {
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

    if (paragrafos.length > 0 && paragrafos[0].toLowerCase().includes(titulo.toLowerCase())) {
      paragrafos.shift();
    }

    // Destacar palavras-chave e referências bíblicas
    const palavrasChave = ["Jesus", "Deus", "Espírito Santo", "fé", "graça"];
    const referenciasRegex = /\b(\d?\s?[A-Za-z]{2,}\s?\d{1,3}[:.]\d{1,3})\b/g;

    paragrafos = paragrafos.map((p) => {
      let texto = p;
      palavrasChave.forEach((palavra) => {
        const regex = new RegExp(`\\b(${palavra})\\b`, "gi");
        texto = texto.replace(regex, "*$1*");
      });
      texto = texto.replace(referenciasRegex, "*$1*");
      return texto;
    });

    const data = new Date().toISOString();

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      paragrafos,
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
