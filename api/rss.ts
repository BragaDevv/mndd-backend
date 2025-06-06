import express, { Request, Response } from "express";
import Parser from "rss-parser";

const router = express.Router();
const parser = new Parser();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const feed = await parser.parseURL("https://www.devocionaisdiarios.com.br/feed");

    const devocionais = feed.items.slice(0, 5).map((item) => ({
      titulo: item.title,
      link: item.link,
      data: item.pubDate,
      resumo: item.contentSnippet,
    }));

    res.json({ devocionais });
  } catch (error) {
    console.error("Erro ao buscar RSS:", error);
    res.status(500).json({ erro: "Falha ao buscar devocionais." });
  }
});

export default router;
