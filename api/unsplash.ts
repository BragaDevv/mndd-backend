import { Request, Response } from "express";

export default async function unsplashHandler(req: Request, res: Response) {
  try {
    // Temas verticais pré-definidos
    const temas = ["blue sky", "starry sky", "orange sky"];
    const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];

    // Use um tamanho vertical comum de celular: retrato
    const width = 1080;
    const height = 1920;

    // Formata tema para URL (ex: "starry sky" → "starry+sky")
    const temaFormatado = encodeURIComponent(temaAleatorio);
    const url = `https://source.unsplash.com/${width}x${height}/?${temaFormatado}`;

    res.status(200).json({
      url,
      tema: temaAleatorio,
    });
  } catch (err) {
    console.error("❌ Erro ao gerar imagem aleatória:", err);
    res.status(500).json({ erro: "Erro ao gerar imagem de fundo" });
  }
}
