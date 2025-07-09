import { Request, Response } from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export const devocionalHandler = async (_req: Request, res: Response) => {
  try {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, "0");
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const ano = hoje.getFullYear();
    const url = `https://ministeriospaodiario.com.br/devocional?date=${dia}/${mes}/${ano}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    const html = await response.text();

    const $ = cheerio.load(html);

    const titulo = $(".content-title").first().text().trim();
    const referencia = $(".verse-bible a").first().text().trim();

    const paragrafos: string[] = [];
    $(".devocional-paragraph p").each((_, el) => {
      const texto = $(el).text().trim();
      if (texto) paragrafos.push(texto);
    });

    const conteudo = paragrafos.join("\n\n");

    if (!conteudo || !titulo) {
      console.warn("⚠️ Conteúdo ou título vazio");
      return res.status(404).json({ error: "Devocional não encontrado." });
    }

    return res.status(200).json({
      titulo,
      publicado: `${dia}/${mes}/${ano}`,
      referencia,
      conteudo,
      link: url,
    });
  } catch (error) {
    console.error("❌ Erro ao buscar devocional:", error);
    return res.status(500).json({ error: "Erro ao buscar devocional." });
  }
};
