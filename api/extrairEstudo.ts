import { Request, Response } from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

// 🧠 Completa a URL caso seja relativa
function completarUrl(src: string, baseUrl: string): string {
  if (src.startsWith("http")) return src;
  if (src.startsWith("/")) {
    const urlObj = new URL(baseUrl);
    return `${urlObj.origin}${src}`;
  }
  return "";
}

export async function extrairEstudoHandler(req: Request, res: Response) {
  const { url, tema: temaEnviado } = req.body;

  if (!url || !url.includes("bibliotecadopregador.com.br")) {
    return res.status(400).json({ error: "URL inválida ou fora do domínio suportado." });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const titulo =
      doc.querySelector("h1.entry-title")?.textContent?.trim() || "Estudo Sem Título";

    const container =
      doc.querySelector("#the-post") ||
      doc.querySelector("div.td-post-content") ||
      doc.querySelector("article");

    if (!container) throw new Error("Conteúdo principal não encontrado.");

    const paragrafos: string[] = [];

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
        const rawSrc = el.getAttribute("data-src") || el.getAttribute("src");
        const src = rawSrc ? completarUrl(rawSrc, url) : "";
        if (src && !src.includes("svg")) {
          console.log("📸 IMG SRC:", src);
          paragrafos.push(src);
        }
      }

      if (tag === "figure") {
        const img = el.querySelector("img");
        const rawSrc = img?.getAttribute("data-src") || img?.getAttribute("src");
        const src = rawSrc ? completarUrl(rawSrc, url) : "";
        if (src && !src.includes("svg")) {
          console.log("📸 FIGURE SRC:", src);
          paragrafos.push(src);
        }
      }
    });

    const unicos = [...new Set(paragrafos)];
    if (unicos.length > 0 && unicos[0].toLowerCase().includes(titulo.toLowerCase())) {
      unicos.shift();
    }

    const palavrasChave = ["Jesus", "Deus", "Espírito Santo", "fé", "graça"];
    const referenciasRegex = /\b(\d?\s?[A-Za-z]{2,}\s?\d{1,3}[:.]\d{1,3})\b/g;

    const paragrafosTratados = unicos.map((p) => {
      if (p.startsWith("http")) return p;
      let texto = p;
      palavrasChave.forEach((palavra) => {
        const regex = new RegExp(`\\b(${palavra})\\b`, "gi");
        texto = texto.replace(regex, "*$1*");
      });
      texto = texto.replace(referenciasRegex, "*$1*");
      return texto;
    });

    const tema = temaEnviado?.trim() || titulo.split("–")[0]?.trim() || "Geral";

    await admin.firestore().collection("estudos_biblicos").add({
      titulo,
      tema,
      paragrafos: paragrafosTratados,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      urlOriginal: url,
      dataPublicacao: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, titulo, tema, paragrafos: paragrafosTratados });
  } catch (error) {
    console.error("❌ Erro ao extrair estudo:", error);
    return res.status(500).json({ error: "Erro ao processar o estudo." });
  }
}
