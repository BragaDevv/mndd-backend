// src/devocional.ts
import { Request, Response } from "express";
import Parser from "rss-parser";
import { JSDOM } from "jsdom";

const parser = new Parser();

export const devocionalHandler = async (req: Request, res: Response) => {
  try {
    const feed = await parser.parseURL("https://api.rbc.org.br/pao-diario/feed/acf");

    if (!feed || !feed.items || feed.items.length === 0) {
      return res.status(404).json({ error: "Devocional não encontrado." });
    }

    const primeiro = feed.items[0]; // Devocional mais recente

    const titulo = primeiro.title || "Devocional";
    const link = primeiro.link || "";
    const publicado = primeiro.pubDate || "";

    let conteudoHTML = primeiro["content:encoded"] || primeiro.content || "";
    const dom = new JSDOM(conteudoHTML);
    const texto = dom.window.document.body.textContent || "";

    return res.status(200).json({
      titulo,
      publicado,
      link,
      conteudo: texto.trim(),
      imagem: null,
    });
  } catch (error) {
    console.error("Erro ao buscar devocional RSS:", error);
    return res.status(500).json({ error: "Erro ao buscar devocional." });
  }
};
