import { Request, Response } from "express";
import { getVersiculoDoDia } from "./versiculoDoDia";

export const versiculoDiaHandler = async (req: Request, res: Response) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const versiculo = getVersiculoDoDia();

  res.status(200).json({
    texto: versiculo.texto,
    referencia: `${versiculo.livro} ${versiculo.capitulo}:${versiculo.versiculo}`,
  });
};
