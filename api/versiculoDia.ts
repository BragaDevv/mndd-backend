import { Request, Response } from "express";
import versiculos from "../data/versiculos.json";

export const versiculoDiaHandler = async (req: Request, res: Response) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const dia = new Date().getDate();
  const versiculo = versiculos[dia % versiculos.length];

  res.status(200).json({
    texto: versiculo.texto,
    referencia: `${versiculo.livro} ${versiculo.capitulo}:${versiculo.versiculo}`,
  });
};
