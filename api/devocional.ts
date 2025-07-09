import { Request, Response } from "express";
import Parser from "rss-parser";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const parser = new Parser();
const FEED_URL = "https://paodiario.org/feed/";

export async function devocionalHandler(req: Request, res: Response) {
    try {
        const feed = await parser.parseURL(FEED_URL);
        const item = feed.items[0];

        if (!item || !item.link) {
            return res.status(404).json({ error: "Nenhum devocional encontrado." });
        }

        // Requisição para a página do devocional
        const response = await fetch(item.link);
        const html = await response.text();
        const $ = cheerio.load(html);

        const conteudoCompleto =
            $(".entry-content").text().trim() ||
            $(".td-post-content").text().trim() ||
            $("article").text().trim();

        const imagem =
            $(".entry-content img").first().attr("src") ||
            $(".td-post-content img").first().attr("src") ||
            $("article img").first().attr("src");


        res.json({
            titulo: item.title,
            publicado: item.pubDate,
            conteudo: conteudoCompleto,
            imagem: imagem || null,
            link: item.link,
        });
    } catch (error) {
        console.error("Erro ao buscar devocional completo:", error);
        res.status(500).json({ error: "Erro ao buscar o devocional completo." });
    }
}
