import { Request, Response } from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const client_id = process.env.SPOTIFY_CLIENT_ID!;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET!;
const playlist_id = "6zqONEthCCgqJqazFiMSeg";

// Tipagem da resposta da playlist
type SpotifyTrackResponse = {
  items: {
    track: {
      name: string;
      artists: { name: string }[];
      album: { images: { url: string }[] };
      duration_ms: number;
    };
  }[];
};

// Gera token de acesso
async function getAccessToken(): Promise<string> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// Rota para retornar músicas da playlist
export default async function handler(req: Request, res: Response) {
  try {
    const token = await getAccessToken();

    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlist_id}/tracks`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await response.json()) as SpotifyTrackResponse;

    const musicas = data.items.map((item) => ({
      nome: item.track.name,
      artista: item.track.artists[0]?.name,
      capa: item.track.album.images[0]?.url,
      duracao_ms: item.track.duration_ms,
    }));

    res.status(200).json(musicas);
  } catch (error) {
    console.error("Erro ao buscar playlist:", error);
    res.status(500).json({ error: "Erro ao buscar playlist" });
  }
}
