import { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

const cifraHandler = async (req: Request, res: Response) => {
  const { url, uid } = req.body;

  if (!url || !uid) {
    return res.status(400).json({ erro: "URL ou UID ausente." });
  }

  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    const titulo = $("h1").first().text().trim();
    const cifra = $(".cifra_cnt").text().trim();

    if (!titulo || !cifra) {
      return res.status(400).json({ erro: "Cifra não encontrada na página." });
    }

    const docRef = await db.collection("cifras_salvas").add({
      uid,
      urlOriginal: url,
      titulo,
      cifra,
      criadoEm: new Date(),
    });

    return res.status(200).json({ sucesso: true, id: docRef.id, titulo });
  } catch (err) {
    console.error("Erro ao buscar cifra:", err);
    return res.status(500).json({ erro: "Erro ao extrair cifra." });
  }
};

export default cifraHandler;
