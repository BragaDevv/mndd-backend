import { Request, Response } from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { format, subDays } from "date-fns";

async function buscarDevocionalPorData(data: Date) {
    const dataFormatada = format(data, "dd/MM/yyyy");
    const url = `https://ministeriospaodiario.com.br/devocional?date=${dataFormatada}`;

    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    console.log("🔍 HTML recebido:");
    console.log(html.slice(0, 500)); // só os 500 primeiros caracteres para não poluir muito

    const titulo = $("article#devocional-detail h1").first().text().trim();
    const imagem = $("article#devocional-detail img").first().attr("src") || null;

    const conteudo = $("article#devocional-detail .prose")
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
    console.log("🔎 Buscando devocional na data:", dataFormatada);
    return null;
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

        res.status(404).json({ error: "Nenhum devocional encontrado nos últimos dias." });
    } catch (error) {
        console.error("Erro ao buscar devocional:", error);
        res.status(500).json({ error: "Erro ao buscar o devocional." });
    }
}
