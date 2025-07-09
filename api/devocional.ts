import { Request, Response } from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { format, subDays } from "date-fns";

async function buscarDevocionalBibliaOnline(data: Date) {
  const dataFormatada = format(data, "yyyy-MM-dd");
  const url = `https://www.bibliaonline.com.br/devocional/${dataFormatada}`;
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const titulo = $("h3").first().text().trim();
  const versiculo = $("h4 + p strong").first().text().trim();
  const conteudo = $("div.devocional-content p")
    .map((_, el) => $(el).text().trim())
    .get()
    .join("\n\n");

  if (!titulo || !conteudo) return null;

  return {
    titulo,
    versiculo,
    conteudo,
    publicado: dataFormatada,
    link: url
  };
}

export async function devocionalHandler(req: Request, res: Response) {
  const hoje = new Date();
  const tentativas = [hoje, subDays(hoje,1), subDays(hoje,2)];
  for (const data of tentativas) {
    const dev = await buscarDevocionalBibliaOnline(data);
    if (dev) return res.json(dev);
  }
  res.status(404).json({ error: "Devocional não encontrado." });
}
