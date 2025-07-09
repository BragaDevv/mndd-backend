import { Request, Response } from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export async function devocionalHandler(req: Request, res: Response) {
  try {
    const url = "https://www.bibliaonline.com.br/devocional-diario?b=acf";
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const titulo = $("h3.titulo").first().text().trim();
    const versiculo = $("p.versiculo, div.devocional-content p strong").first().text().trim();

    const conteudo = $("div.devocional-content p")
      .map((_, el) => $(el).text().trim())
      .get().join("\n\n");

    if (!titulo || !conteudo) {
      return res.status(404).json({ error: "Devocional não encontrado." });
    }

    return res.json({
      titulo,
      versiculo,
      conteudo,
      link: url
    });
  } catch (err) {
    console.error("Erro ao buscar devocional:", err);
    return res.status(500).json({ error: "Erro ao buscar devocional." });
  }
}
