import { Request, Response } from "express";
import Parser from "rss-parser";

const parser = new Parser();
const FEED_URL = "https://paodiario.org/feed/";

export async function devocionalHandler(req: Request, res: Response) {
  try {
    const feed = await parser.parseURL(FEED_URL);
    const hoje = new Date().toDateString();

    // Pega o primeiro item (assumindo que é o do dia)
    const item = feed.items[0];

    if (item) {
      res.json({
        titulo: item.title,
        link: item.link,
        conteudo: item.contentSnippet || item.content || "",
        publicado: item.pubDate,
      });
    } else {
      res.status(404).json({ error: "Nenhum devocional encontrado." });
    }
  } catch (error) {
    console.error("Erro ao buscar devocional:", error);
    res.status(500).json({ error: "Erro ao buscar o devocional." });
  }
}
