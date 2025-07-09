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

// ✅ ROTA PARA LISTAR MÚSICAS DA PLAYLIST
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

// ✅ ROTA PARA ADICIONAR MÚSICA NA PLAYLIST
export async function adicionarMusicaSpotify(req: Request, res: Response) {
  const { nome, artista } = req.body;

  if (!nome || !artista) {
    return res.status(400).json({ error: "Campos 'nome' e 'artista' são obrigatórios." });
  }

  try {
    const token = await getAccessToken();

    // 1. Buscar música no Spotify
    const searchQuery = encodeURIComponent(`${nome} ${artista}`);
    const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery}&type=track&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    type SpotifySearchResponse = {
      tracks: { items: { uri: string }[] };
    };

    const searchData = (await searchResponse.json()) as SpotifySearchResponse;
    const track = searchData.tracks.items[0];

    if (!track) {
      return res.status(404).json({ error: "Música não encontrada no Spotify." });
    }

    // 2. Adicionar à playlist
    const addResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlist_id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [track.uri] }),
    });

    if (!addResponse.ok) {
      const error = await addResponse.text();
      throw new Error(error);
    }

    return res.status(200).json({ success: true, uri: track.uri });
  } catch (error) {
    console.error("Erro ao adicionar música:", error);
    return res.status(500).json({ error: "Erro ao adicionar música ao Spotify." });
  }
}
