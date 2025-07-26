import { Request, Response } from "express";
import fetch from "node-fetch";

export default async function unsplashHandler(req: Request, res: Response) {
  try {
    const temas = ["blue sky", "starry sky", "orange sky"];
    const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];
    const temaFormatado = encodeURIComponent(temaAleatorio);

    const urlSource = `https://source.unsplash.com/1080x1920/?${temaFormatado}`;

    // Obtem URL final após redirecionamento
    const response = await fetch(urlSource, {
      method: "GET",
      redirect: "follow",
    });

    const finalUrl = response.url;

    res.status(200).json({
      url: finalUrl,
      tema: temaAleatorio,
    });
  } catch (err) {
    console.error("❌ Erro ao buscar imagem do Unsplash:", err);
    res.status(500).json({ erro: "Erro ao buscar imagem do Unsplash" });
  }
}
