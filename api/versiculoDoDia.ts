import versiculos from "../data/versiculos.json";

// Dia do ano (1 a 366) — varia o versículo ao longo do ano inteiro
export function diaDoAno(d = new Date()): number {
  const inicio = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - inicio.getTime();
  return Math.floor(diff / 86_400_000);
}

// Retorna o versículo do dia atual (mesma lógica para app e notificação)
export function getVersiculoDoDia(d = new Date()) {
  const index = (diaDoAno(d) - 1) % versiculos.length;
  return versiculos[index];
}
