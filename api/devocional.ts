import { Request, Response } from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

async function buscarDevocionalPorData(data: Date) {
    const dataFormatada = format(data, "dd/MM/yyyy");
    const url = `https://ministeriospaodiario.com.br/devocional?date=${dataFormatada}`;

    const res = await fetch(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    const titulo = $(".title-article").first().text().trim();
    const conteudo = $(".content-article").first().text().trim();
    const imagem = $(".image-article img").first().attr("src");

    if (titulo && conteudo) {
        return {
            titulo,
            conteudo,
            imagem: imagem || null,
            publicado: format(data, "yyyy-MM-dd"),
            link: url,
        };
    }

    return null;
}

export async function devocionalHandler(req: Request, res: Response) {
    try {
        const hoje = new Date();

        // tenta o devocional de hoje, se falhar tenta o de ontem
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
