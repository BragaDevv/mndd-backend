// devocional.ts - Rota para extrair devocional do Pão Diário com Puppeteer no Render

import { Request, Response } from "express";
import puppeteer from "puppeteer";

export async function devocionalHandler(_req: Request, res: Response) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const url = `https://ministeriospaodiario.com.br/devocional`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Aguarda os elementos carregarem
    await page.waitForSelector("h1");

    const dados = await page.evaluate(() => {
      const titulo = document.querySelector("h1")?.textContent?.trim() || "";

      const versiculo = document.querySelector("h2")?.textContent?.trim() || "";

      const paragrafos = Array.from(
        document.querySelectorAll("article p")
      ).map((el) => el.textContent?.trim()).filter(Boolean);

      const conteudo = paragrafos.join("\n\n");

      const link = window.location.href;

      return { titulo, versiculo, conteudo, link };
    });

    await browser.close();

    if (!dados.conteudo || !dados.titulo) {
      console.warn("⚠️ Conteúdo ou título vazio");
      return res.status(404).json({ error: "Devocional não encontrado." });
    }

    return res.json(dados);
  } catch (error) {
    console.error("❌ Erro ao buscar devocional:", error);
    return res.status(500).json({ error: "Erro ao buscar devocional." });
  }
}
