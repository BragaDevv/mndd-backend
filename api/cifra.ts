import { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import admin from "firebase-admin";

export default async function cifraHandler(req: Request, res: Response) {
  // ✅ GET → Listar todas as cifras (uid é opcional)
  if (req.method === "GET") {
    const { uid } = req.query;

    try {
      const queryRef = admin.firestore().collection("cifras_salvas");

      let snapshot;

      if (uid && typeof uid === "string") {
        snapshot = await queryRef
          .where("uid", "==", uid)
          .orderBy("criadoEm", "desc")
          .get();
      } else {
        snapshot = await queryRef.orderBy("criadoEm", "desc").get();
      }

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

  // ✅ POST → Salvar nova cifra com numeração global (uid é opcional)
  if (req.method === "POST") {
    const { url, uid } = req.body;

    if (!url) {
      return res.status(400).json({ erro: "URL da cifra ausente." });
    }

    try {
      const htmlResponse = await axios.get(url);
      const $ = cheerio.load(htmlResponse.data);

      const tituloMeta = $('meta[property="og:title"]').attr("content")?.trim();
      const tituloFallback = $("h1").first().text().trim();
      const tituloOriginal = tituloMeta || tituloFallback;

      const cifra = $(".cifra_cnt").text().trim();

      if (!tituloOriginal || !cifra) {
        return res
          .status(400)
          .json({ erro: "Não foi possível extrair a cifra." });
      }

      // 🔢 Gerar número global da cifra
      const snapshot = await admin
        .firestore()
        .collection("cifras_salvas")
        .get();
      const numero = snapshot.size + 1;
      const numeroFormatado = String(numero).padStart(3, "0");
      const titulo = `${numeroFormatado} - ${tituloOriginal}`;

      const novaCifra: any = {
        urlOriginal: url,
        titulo,
        cifra,
        criadoEm: new Date(),
      };

      if (uid) novaCifra.uid = uid;

      const docRef = await admin
        .firestore()
        .collection("cifras_salvas")
        .add(novaCifra);

      return res.status(200).json({ sucesso: true, id: docRef.id, titulo });
    } catch (err) {
      console.error("Erro ao salvar cifra:", err);
      return res
        .status(500)
        .json({ erro: "Erro ao extrair ou salvar a cifra." });
    }
  }

  // ✅ PATCH → Atualizar cifra e/ou título
  if (req.method === "PATCH") {
    const { id } = req.query;
    const { titulo, cifra } = req.body;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ erro: "ID da cifra ausente ou inválido." });
    }

    const dadosParaAtualizar: any = {};
    if (titulo && typeof titulo === "string")
      dadosParaAtualizar.titulo = titulo;
    if (cifra && typeof cifra === "string") dadosParaAtualizar.cifra = cifra;

    if (Object.keys(dadosParaAtualizar).length === 0) {
      return res.status(400).json({ erro: "Nada para atualizar." });
    }

    try {
      const docRef = admin.firestore().collection("cifras_salvas").doc(id);
      await docRef.update(dadosParaAtualizar);

      return res.status(200).json({ sucesso: true });
    } catch (error) {
      console.error("Erro ao atualizar cifra:", error);
      return res.status(500).json({ erro: "Erro ao atualizar a cifra." });
    }
  }

  // ✅ DELETE → Remover cifra por ID (sem exigir uid)
  if (req.method === "DELETE") {
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ erro: "ID ausente ou inválido." });
    }

    try {
      await admin.firestore().collection("cifras_salvas").doc(id).delete();
      return res.status(200).json({ sucesso: true });
    } catch (error) {
      console.error("Erro ao excluir cifra:", error);
      return res.status(500).json({ erro: "Erro ao excluir a cifra." });
    }
  }

  // ⛔ Método não permitido
  return res.status(405).send("Método não permitido.");
}
