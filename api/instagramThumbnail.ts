import type { Request, Response } from "express";
import * as cheerio from "cheerio";

function normalizeInstagramUrl(raw: string) {
  const url = (raw || "").trim()
    .replace("www.instagran.com", "www.instagram.com")
    .replace("instagran.com", "instagram.com");

  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return `https://${url}`;
  return url;
}

export default async function instagramThumbnail(req: Request, res: Response) {
  try {
    const urlRaw = String(req.query.url || "");
    const url = normalizeInstagramUrl(urlRaw);

    if (!url || !url.includes("instagram.com")) {
      return res.status(400).json({ ok: false, error: "invalid_url" });
    }

    // Instagram às vezes bloqueia sem User-Agent
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });

    const html = await r.text();
    const $ = cheerio.load(html);

    const ogImage =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="og:image"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      "";

    const ogTitle =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text() ||
      "";

    // Se não achar capa, ainda devolve ok=false com dica
    if (!ogImage) {
      return res.json({
        ok: false,
        error: "thumbnail_not_found",
        normalizedUrl: url,
        title: ogTitle,
      });
    }

    return res.json({
      ok: true,
      normalizedUrl: url,
      title: ogTitle,
      thumbnailUrl: ogImage,
    });
  } catch (e: any) {
    console.error("instagramThumbnail error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}