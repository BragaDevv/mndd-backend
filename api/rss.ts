import { VercelRequest, VercelResponse } from "@vercel/node";
import Parser from "rss-parser";

const parser = new Parser();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const feed = await parser.parseURL("https://pao-diario-devocional.webnode.page/rss/all.xml");

    const devocionais = feed.items.slice(0, 10).map((item) => ({
      titulo: item.title,
      descricao: item.contentSnippet,
      link: item.link,
      data: item.pubDate,
    }));

    res.status(200).json(devocionais);
  } catch (error) {
    console.error("Erro ao buscar RSS:", error);
    res.status(500).json({ error: "Erro ao buscar RSS" });
  }
}
