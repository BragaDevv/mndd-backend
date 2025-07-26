import { Request, Response } from "express";

export default function unsplashHandler(req: Request, res: Response) {
  try {
    const temas = ["sky", "stars", "orange", "clouds", "sunset"];
    const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];
    const seed = encodeURIComponent(temaAleatorio);

    const url = `https://picsum.photos/seed/${seed}/1080/1920`;

    res.status(200).json({
      url,
      tema: temaAleatorio,
    });
  } catch (err) {
    console.error("❌ Erro ao gerar URL do Picsum:", err);
    res.status(500).json({ erro: "Erro ao gerar imagem aleatória" });
  }
}
