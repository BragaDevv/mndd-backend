import { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import admin from "firebase-admin";

export default async function cifraHandler(req: Request, res: Response) {
  // ✅ GET → Listar cifras salvas por UID
  if (req.method === "GET") {
    const { uid } = req.query;

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ erro: "UID ausente ou inválido." });
    }

    try {
      const snapshot = await admin
        .firestore()
        .collection("cifras_salvas")
        .where("uid", "==", uid)
        .orderBy("criadoEm", "desc")
        .get();

      const cifras = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.status(200).json(cifras);
    } catch (error) {
      console.error("Erro ao buscar cifras:", error);
      return res.status(500).json({ erro: "Erro ao buscar cifras." });
    }
  }

  // ✅ POST → Salvar nova cifra
  if (req.method === "POST") {
    const { url, uid } = req.body;

    if (!url || !uid) {
      return res.status(400).json({ erro: "URL ou UID ausente." });
    }

    try {
      const htmlResponse = await axios.get(url);
      const $ = cheerio.load(htmlResponse.data);

      const tituloMeta = $('meta[property="og:title"]').attr("content")?.trim();
      const tituloFallback = $("h1").first().text().trim();
      const titulo = tituloMeta || tituloFallback;

      const cifra = $(".cifra_cnt").text().trim();

      if (!titulo || !cifra) {
        return res
          .status(400)
          .json({ erro: "Não foi possível extrair a cifra." });
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
      return res
        .status(500)
        .json({ erro: "Erro ao extrair ou salvar a cifra." });
    }
  }

  // ⛔ Outros métodos não permitidos
  return res.status(405).send("Método não permitido.");
}
