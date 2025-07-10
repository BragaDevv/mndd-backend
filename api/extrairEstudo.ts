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

    // Captura e limpeza do título
    let tituloOriginal = doc.querySelector("h1")?.textContent?.trim() || "Estudo Sem Título";

    // Remove prefixos genéricos como "Estudo Bíblico:"
    tituloOriginal = tituloOriginal.replace(/^Estudo Bíblico[\s:-]*/i, "").trim();

    const tema = temaEnviado?.trim() || tituloOriginal.split("–")[0]?.trim() || "Geral";

    // Extração e limpeza dos parágrafos
    const conteudoDiv = doc.querySelector(".com-content-article__body");
    let paragrafos = htmlToText(conteudoDiv?.innerHTML || "", {
      wordwrap: false,
      selectors: [{ selector: "a", format: "skip" }],
    })
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    // Remove o primeiro parágrafo se ele for idêntico ao título
    if (
      paragrafos.length > 0 &&
      paragrafos[0].toLowerCase() === tituloOriginal.toLowerCase()
    ) {
      paragrafos.shift();
    }

    const data = new Date().toISOString();

    await admin.firestore().collection("estudos_biblicos").add({
      titulo: tituloOriginal,
      tema,
      conteudo: paragrafos,       // compatível com estudos antigos
      paragrafos,                 // novo campo, mais explícito
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      urlOriginal: url,
      dataPublicacao: data,
    });

    return res.status(200).json({
      success: true,
      titulo: tituloOriginal,
      tema,
      paragrafos,
    });
  } catch (error) {
    console.error("❌ Erro ao extrair estudo:", error);
    return res.status(500).json({ error: "Erro ao processar o estudo." });
  }
}
