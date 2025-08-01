// cortarAssinatura.ts
import express, { Request, Response } from "express";
import sharp from "sharp";

const router = express.Router();

// POST /api/cortar-assinatura
router.post("/cortar-assinatura", async (req: Request, res: Response) => {
  try {
    const { base64 } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Base64 não fornecido." });
    }

    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const imagemCortada = await sharp(buffer)
      .trim() // ✂️ Corta automaticamente as bordas brancas
      .png()
      .toBuffer();

    const base64Final = `data:image/png;base64,${imagemCortada.toString("base64")}`;

    return res.status(200).json({ base64: base64Final });
  } catch (err) {
    console.error("❌ Erro ao cortar assinatura:", err);
    return res.status(500).json({ error: "Erro ao processar imagem." });
  }
});

export default router;
