import { Request, Response } from "express";
import fetch from "node-fetch";

export default async function unsplashHandler(req: Request, res: Response) {
  try {
    const temas = ["blue sky", "starry sky", "orange sky"];
    const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];
    const temaFormatado = encodeURIComponent(temaAleatorio);

    const urlBase = `https://source.unsplash.com/1080x1920/?${temaFormatado}`;

    // Faz o fetch para obter a URL final da imagem (resolve o redirecionamento)
    const response = await fetch(urlBase, { method: "HEAD", redirect: "follow" });

    // A URL final da imagem (real e acessível)
    const finalUrl = response.url;

    res.status(200).json({
      url: finalUrl,
      tema: temaAleatorio,
    });
  } catch (err) {
    console.error("❌ Erro ao resolver imagem:", err);
    res.status(500).json({ erro: "Erro ao gerar imagem de fundo" });
  }
}
