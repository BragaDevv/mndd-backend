import { Request, Response } from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';

const cache = new Map<string, Buffer>();

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function ttsHandler(req: Request, res: Response): Promise<void> {
  const texto = (req.query.texto ?? req.body?.texto) as string | undefined;
  if (!texto?.trim()) {
    res.status(400).json({ error: 'texto obrigatório' });
    return;
  }

  const AZURE_KEY    = process.env.AZURE_TTS_KEY;
  const AZURE_REGION = process.env.AZURE_TTS_REGION ?? 'brazilsouth';

  if (!AZURE_KEY) {
    res.status(503).json({ error: 'AZURE_TTS_KEY não configurada' });
    return;
  }

  const key = crypto.createHash('md5').update(texto.trim()).digest('hex');

  if (cache.has(key)) {
    const buf = cache.get(key)!;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
    return;
  }

  const ssml = `<speak version='1.0' xml:lang='pt-BR'><voice name='pt-BR-AntonioNeural'>${escapeXml(texto.trim())}</voice></speak>`;

  try {
    const azureRes = await fetch(
      `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        },
        body: ssml,
      },
    );

    if (!azureRes.ok) {
      const errText = await azureRes.text();
      res.status(502).json({ error: 'Azure TTS error', detail: errText.slice(0, 300) });
      return;
    }

    const buffer = Buffer.from(await azureRes.arrayBuffer());

    // limite simples de cache: descarta o mais antigo ao chegar em 500 entradas
    if (cache.size >= 500) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, buffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err: any) {
    console.error('[TTS] Erro:', err?.message);
    res.status(500).json({ error: 'Erro interno TTS' });
  }
}
