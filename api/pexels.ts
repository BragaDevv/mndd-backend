import dotenv from "dotenv";
dotenv.config();

import { Request, Response } from "express";
import fetch from "node-fetch";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export default async function pexelsHandler(req: Request, res: Response) {
  try {
    const temas = ["blue sky", "sunset sky", "starry night", "sky", "God"];
    const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];
    const perPage = 15;

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(temaAleatorio)}&orientation=portrait&per_page=${perPage}`,
      {
        headers: {
          Authorization: PEXELS_API_KEY!,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Erro ao buscar imagem: ${response.statusText}`);
    }

    const data = await response.json() as {
      photos: {
        src: { large: string };
        photographer: string;
        url: string;
      }[];
    };

    const fotos = data.photos;

    if (!fotos || fotos.length === 0) {
      throw new Error("Nenhuma imagem encontrada");
    }

    const indexAleatorio = Math.floor(Math.random() * fotos.length);
    const foto = fotos[indexAleatorio];

    res.status(200).json({
      imageUrl: foto.src.large,
      autor: foto.photographer,
      link: foto.url,
      tema: temaAleatorio,
    });
  } catch (err) {
    console.error("❌ Erro na API Pexels:", err);
    res.status(500).json({ erro: "Erro ao buscar imagem do Pexels" });
  }
}
