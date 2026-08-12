import { PALETTE } from "../fx/materials";
import type { CardDefinition } from "./CardDeckSystem";

/**
 * Catalogo de cartas do jogo (Etapa 9). Antes vivia inline em `main.ts`;
 * centralizado aqui para `main.ts` so montar o `CardDeckSystem`, sem definir
 * conteudo de jogo. Ordenado por custo crescente.
 *
 * `accentColor` sempre vem da `PALETTE` (src/fx/materials.ts) — a mesma cor
 * de acento usada no visual 3D da criatura, entao a cor da carta bate com a
 * cor do bicho na arena.
 */
export const CARD_CATALOG: CardDefinition[] = [
  {
    id: "javali-raivoso",
    name: "Javali Raivoso",
    summary: "Vida 200. O dano cresce com a distancia percorrida.",
    cost: 2,
    accentColor: PALETTE.accentJavali,
  },
  {
    id: "tatu-bola",
    name: "Tatu Bola",
    summary: "Corpo a corpo medio: mais resistente que o Javali, mais rapido que o Cururu.",
    cost: 3,
    accentColor: PALETTE.accentTatu,
  },
  {
    id: "dona-barata",
    name: "Dona Barata",
    summary: "Invoca 3 baratas frageis que lancam havaianas de pau no alcance da torre.",
    cost: 4,
    accentColor: PALETTE.accentBarata,
  },
  {
    id: "cururu-bombado",
    name: "Cururu Bombado",
    summary: "Tanque azul com 60% da vida da torre e super linguada crescente.",
    cost: 5,
    accentColor: PALETTE.accentCururu,
  },
];
