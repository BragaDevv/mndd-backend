import { Request, Response } from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { format, subDays } from "date-fns";

async function buscarDevocionalPorData(data: Date) {
    const dataFormatada = format(data, "dd/MM/yyyy");
    const url = `https://ministeriospaodiario.com.br/devocional?date=${dataFormatada}`;

    try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        const artigo = $("article#devocional-detail");

        const titulo = artigo.find("h1").first().text().trim();
        const imagem = artigo.find("img").first().attr("src") || null;

        const conteudo = artigo
            .find(".prose")
            .children("p")
            .map((_, el) => $(el).text().trim())
            .get()
            .join("\n\n");

        if (titulo && conteudo.length > 30) {
            return {
                titulo,
                conteudo,
                imagem,
                publicado: format(data, "yyyy-MM-dd"),
                link: url,
            };
        }

        return null;
    } catch (err) {
        console.error("❌ Erro ao buscar HTML:", err);
        return null;
    }
}


export async function devocionalHandler(req: Request, res: Response) {
    try {
        const hoje = new Date();
        const tentativas = [hoje, subDays(hoje, 1), subDays(hoje, 2)];

        for (const data of tentativas) {
            const devocional = await buscarDevocionalPorData(data);
            if (devocional) {
                return res.json(devocional);
            }
        }

        // ⚠️ Novo fallback: ao menos retorna o link de hoje
        const fallbackUrl = `https://ministeriospaodiario.com.br/devocional?date=${format(hoje, "dd/MM/yyyy")}`;
        return res.json({
            titulo: "Devocional",
            conteudo: "",
            imagem: null,
            publicado: format(hoje, "yyyy-MM-dd"),
            link: fallbackUrl,
        });
    } catch (error) {
        console.error("Erro ao buscar devocional:", error);
        res.status(500).json({ error: "Erro ao buscar o devocional." });
    }
}
