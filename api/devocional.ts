import { Request, Response } from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function devocionalHandler(req: Request, res: Response) {
  try {
    const rssUrl = "https://paodiario.org/feed/";
    const response = await fetch(rssUrl);
    const xml = await response.text();

    const $ = cheerio.load(xml, { xmlMode: true });

    const firstItem = $("item").first();

    const titulo = firstItem.find("title").text();
    const publicado = firstItem.find("pubDate").text();
    const link = firstItem.find("link").text();
    const rawDescription = firstItem.find("description").text();

    // 🧼 Limpa o conteúdo do <description> (vem com <p>, <br>, etc)
    const $$ = cheerio.load(rawDescription);
    const conteudo = $$.text().replace(/\s+/g, " ").trim();

    return res.json({
      titulo: titulo || "Devocional",
      publicado,
      link,
      conteudo,
      imagem: null, // não tem imagem nesse feed
    });
  } catch (error) {
    console.error("❌ Erro ao buscar devocional RSS:", error);
    return res.status(500).json({ error: "Erro ao buscar devocional." });
  }
}
