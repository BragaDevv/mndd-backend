import { Request, Response } from "express";
import Parser from "rss-parser";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const parser = new Parser();
const FEED_URL = "https://paodiario.org/feed/";

export async function devocionalHandler(req: Request, res: Response) {
  try {
    const feed = await parser.parseURL(FEED_URL);

    for (const item of feed.items) {
      const link = item.link || "";

      // Somente devocionais reais (não artigos avulsos)
      if (!link.includes("paodiario.org/202")) continue;

      const response = await fetch(link);
      const html = await response.text();
      const $ = cheerio.load(html);

      const conteudo =
        $(".entry-content").text().trim() ||
        $(".td-post-content").text().trim() ||
        $("article").text().trim();

      const imagem =
        $(".entry-content img").first().attr("src") ||
        $(".td-post-content img").first().attr("src") ||
        $("article img").first().attr("src");

      if (conteudo.length > 100) {
        return res.json({
          titulo: item.title,
          publicado: item.pubDate,
          conteudo,
          imagem: imagem || null,
          link,
        });
      }
    }

    // Se nenhum devocional válido foi encontrado
    res.status(404).json({ error: "Nenhum devocional válido encontrado no feed." });
  } catch (error) {
    console.error("Erro ao buscar devocional:", error);
    res.status(500).json({ error: "Erro ao buscar o devocional." });
  }
}
