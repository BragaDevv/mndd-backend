import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

export async function extrairEstudoHandler(req: Request, res: Response) {
  const { url, tema: temaEnviado } = req.body;

  if (!url) return res.status(400).json({ error: "URL não informada." });

  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    let titulo = "Estudo Sem Título";
    const paragrafos: string[] = [];

    // -------- SITE: estudosgospel.com.br --------
    if (url.includes("estudosgospel.com.br")) {
      titulo = doc.querySelector("h1")?.textContent?.trim() || titulo;
      titulo = titulo.replace(/^Estudo Bíblico[\s:-]*/i, "").trim();

      const corpo = doc.querySelector(".com-content-article__body");
      if (corpo) {
        corpo.querySelectorAll("p").forEach((p) => {
          const texto = p.textContent?.trim();
          if (texto && texto.length > 20) paragrafos.push(texto);
        });
      }
    }

    // -------- SITE: bibliotecadopregador.com.br --------
    else if (url.includes("bibliotecadopregador.com.br")) {
      titulo = doc.querySelector("h1.entry-title")?.textContent?.trim() || titulo;

      const container =
        doc.querySelector("#the-post") ||
        doc.querySelector("div.td-post-content") ||
        doc.querySelector("article");

      if (!container) throw new Error("Conteúdo não encontrado.");

      container.querySelectorAll("p, img, figure").forEach((el) => {
        const tag = el.tagName.toLowerCase();

        if (tag === "p") {
          const texto = el.textContent?.trim();
          if (
            texto &&
            texto.length > 20 &&
            !/^autor[:\-]/i.test(texto) &&
            !texto.toLowerCase().includes("divulgação")
          ) {
            paragrafos.push(texto);
          }
        }

        if (tag === "img") {
          const src = el.getAttribute("data-src") || el.getAttribute("src");
          console.log("📸 IMG SRC:", src);
          if (src && src.startsWith("http") && !src.includes("svg")) {
            paragrafos.push(src);
          }
        }

        if (tag === "figure") {
          const img = el.querySelector("img");
          const src = img?.getAttribute("data-src") || img?.getAttribute("src");
          console.log("📸 FIGURE SRC:", src);
          if (src && src.startsWith("http") && !src.includes("svg")) {
            paragrafos.push(src);
          }
        }
      });
    }

    // -------- DOMÍNIO NÃO SUPORTADO --------
    else {
      return res.status(400).json({ error: "Este domínio ainda não é suportado." });
    }

    // -------- TRATAMENTO FINAL --------
    const unicos = [...new Set(paragrafos)];

    const tema = temaEnviado?.trim() || titulo.split("–")[0]?.trim() || "Geral";

    if (unicos.length > 0 && unicos[0].toLowerCase().includes(titulo.toLowerCase())) {
      unicos.shift();
    }

    const palavrasChave = ["Jesus", "Deus", "Espírito Santo", "fé", "graça"];
    const referenciasRegex = /\b(\d?\s?[A-Za-z]{2,}\s?\d{1,3}[:.]\d{1,3})\b/g;

    const paragrafosTratados = unicos.map((p) => {
      if (p.startsWith("http")) return p; // imagem
      let texto = p;
      palavrasChave.forEach((palavra) => {
        const regex = new RegExp(`\\b(${palavra})\\b`, "gi");
        texto = texto.replace(regex, "*$1*");
      });
      texto = texto.replace(referenciasRegex, "*$1*");
      return texto;
    });

    const data = new Date().toISOString();

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      paragrafos: paragrafosTratados,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      urlOriginal: url,
      dataPublicacao: data,
    });

    return res.status(200).json({ success: true, titulo, tema, paragrafos: paragrafosTratados });

  } catch (error) {
    console.error("❌ Erro ao extrair estudo:", error);
    return res.status(500).json({ error: "Erro ao processar o estudo." });
  }
}
