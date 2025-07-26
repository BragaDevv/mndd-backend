import { Request, Response } from "express";
import fetch from "node-fetch";

export default async function unsplashHandler(req: Request, res: Response) {
  try {
    const temas = ["blue sky", "starry sky", "orange sky"];
    const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];
    const temaFormatado = encodeURIComponent(temaAleatorio);

    const urlSource = `https://source.unsplash.com/1080x1920/?${temaFormatado}`;

    // Pega o HEAD apenas para seguir o redirecionamento
    const response = await fetch(urlSource, {
      method: "HEAD", // <- importante: HEAD evita baixar a imagem inteira
      redirect: "manual", // <- precisamos capturar o redirecionamento
    });

    const finalUrl = response.headers.get("location");

    if (!finalUrl) {
      throw new Error("Não foi possível obter a imagem final.");
    }

    res.status(200).json({
      url: finalUrl,
      tema: temaAleatorio,
    });
  } catch (err) {
    console.error("❌ Erro ao buscar imagem do Unsplash:", err);
    res.status(500).json({ erro: "Erro ao buscar imagem do Unsplash" });
  }
}
