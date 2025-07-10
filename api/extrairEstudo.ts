// api/extrairEstudo.ts
import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { htmlToText } from "html-to-text";

export async function extrairEstudoHandler(req: Request, res: Response) {
  const { url } = req.body;

  if (!url || !url.includes("estudosgospel.com.br")) {
    return res.status(400).json({ error: "URL inválida ou não suportada." });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const titulo = doc.querySelector("h1")?.textContent?.trim() || "Estudo Sem Título";
    const tema = titulo.split("–")[0]?.trim() || "Geral";

    const conteudoDiv = doc.querySelector(".com-content-article__body");
    const paragrafos = htmlToText(conteudoDiv?.innerHTML || "", {
      wordwrap: false,
      selectors: [{ selector: "a", format: "skip" }],
    }).split("\n").filter(p => p.trim().length > 20);

    const data = new Date().toISOString();

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      conteudo: paragrafos,
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
