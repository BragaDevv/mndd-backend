import express = require("express");
const Parser = require("rss-parser");

const router = express.Router();
const parser = new Parser();

router.get("/rss", async (_req, res) => {
  try {
    const feed = await parser.parseURL("https://pao-diario-devocional.webnode.page/rss/all.xml");

    const devocionais = feed.items.slice(0, 10).map((item: any) => ({
      titulo: item.title,
      descricao: item.contentSnippet,
      link: item.link,
      data: item.pubDate,
    }));

    res.status(200).json(devocionais);
  } catch (error) {
    console.error("❌ Erro ao buscar RSS:", error);
    res.status(500).json({ error: "Erro ao buscar RSS" });
  }
});

module.exports = router;
