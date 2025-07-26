import { Request, Response } from "express";
import fetch from "node-fetch";

export default async function unsplashHandler(req: Request, res: Response) {
  try {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;

    // Temas fixos
    const temas = ["blue sky", "starry sky", "orange sky"];
    const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];

    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(
        temaAleatorio
      )}&orientation=portrait&client_id=${accessKey}`
    );

    if (!response.ok) throw new Error("Erro na requisição à API do Unsplash");

    const data = await response.json() as {
      urls: { full: string; regular: string };
      user?: { name?: string };
      description?: string;
      alt_description?: string;
    };

    res.status(200).json({
      url: data.urls.full,
      autor: data.user?.name,
      descricao: data.description || data.alt_description,
      tema: temaAleatorio,
    });
  } catch (err) {
    console.error("❌ Erro ao buscar imagem do Unsplash:", err);
    res.status(500).json({ erro: "Erro ao buscar imagem do Unsplash" });
  }
}
