import { Request, Response } from "express";
import fetch from "node-fetch";

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

export default async function unsplashHandler(req: Request, res: Response) {
    try {
        const temas = ["blue sky", "sunset sky", "starry night"];
        const temaAleatorio = temas[Math.floor(Math.random() * temas.length)];

        const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(
            temaAleatorio
        )}&orientation=portrait&client_id=${ACCESS_KEY}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro ao buscar imagem: ${response.statusText}`);
        }

        const data = await response.json() as {
            urls: { regular: string };
            user: { name: string };
            links: { html: string };
        };


        res.status(200).json({
            imageUrl: data.urls.regular,
            autor: data.user.name,
            link: data.links.html,
            tema: temaAleatorio,
        });
    } catch (err) {
        console.error("❌ Erro na API Unsplash:", err);
        res.status(500).json({ erro: "Erro ao buscar imagem do Unsplash" });
    }
}
