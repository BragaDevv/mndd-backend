import { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import admin from "firebase-admin";

export default async function cifraHandler(req: Request, res: Response) {
  const { url, uid } = req.body;

  if (!url || !uid) {
    return res.status(400).json({ erro: "URL ou UID ausente." });
  }

  try {
    const htmlResponse = await axios.get(url);
    const $ = cheerio.load(htmlResponse.data);

    const titulo = $("h1").first().text().trim();
    const cifra = $(".cifra_cnt").text().trim();

    if (!titulo || !cifra) {
      return res.status(400).json({ erro: "Não foi possível extrair a cifra." });
    }

    const docRef = await admin.firestore().collection("cifras_salvas").add({
      uid,
      urlOriginal: url,
      titulo,
      cifra,
      criadoEm: new Date(),
    });

    return res.status(200).json({ sucesso: true, id: docRef.id, titulo });
  } catch (err) {
    console.error("Erro ao salvar cifra:", err);
    return res.status(500).json({ erro: "Erro ao extrair ou salvar a cifra." });
  }
}
