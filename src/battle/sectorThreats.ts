/**
 * Resumo de ameaca por setor do arco: quantos inimigos vivos em cada flanco e
 * qual o mais proximo do jogador. Logica pura, sem Babylon — quem tem as
 * unidades (`CombatEngine.getSectorThreats`) so converte posicao para o par
 * polar e chama aqui.
 *
 * Existe separado do `CombatEngine` por causa do invariante 3 do quadro (regra
 * nova nasce em arquivo puro com teste ao lado) e porque quem consome isto e a
 * JG-05: a seta de flanco diz **quantos**, e a distancia decide a urgencia do
 * alerta. Ver `docs/specs-arena-180/JG-04-diretor-de-ondas.md`.
 */

import { sectorOf, type ArcPoint, type SectorId } from "../arena/ArenaArc";

export interface SectorThreat {
  sector: SectorId;
  count: number;
  /**
   * Raio (em metros) do inimigo mais PROXIMO do jogador neste setor — menor
   * raio, ja que o jogador e o vertice do arco. `Number.POSITIVE_INFINITY`
   * quando `count` e 0; quem le checa `count` antes de usar este campo.
   */
  nearestRadiusM: number;
}

// Mesma ordem de `ArenaArc.SECTOR_IDS` (esquerda -> direita por azimute
// crescente). Duplicada aqui porque aquela lista e privada do modelo polar e
// exporta-la so para esta funcao daria a impressao de que a ordem dos setores
// e um contrato publico do arco.
const SECTORS: readonly SectorId[] = ["left", "center", "right"];

/**
 * Um `SectorThreat` por setor, SEMPRE os tres e sempre na mesma ordem — um
 * setor sem ninguem vem com `count: 0`, e nao ausente. Assim a UI de alerta
 * pode desenhar/apagar as tres setas lendo a mesma lista, sem tratar buraco.
 *
 * Ponto fora do arco (`sectorOf` devolve `null`) e ignorado: pelo `DR-1` nao
 * existe ameaca atras do jogador, entao um ponto la e ruido de posicao (uma
 * unidade atravessando a fronteira, por exemplo), nunca um flanco a alertar.
 */
export function summarizeSectorThreats(points: readonly ArcPoint[]): SectorThreat[] {
  const threats = new Map<SectorId, SectorThreat>(
    SECTORS.map((sector) => [sector, { sector, count: 0, nearestRadiusM: Number.POSITIVE_INFINITY }])
  );

  for (const point of points) {
    const sector = sectorOf(point.azimuthDeg);

    if (sector === null) {
      continue;
    }

    const threat = threats.get(sector);
    if (!threat) {
      continue;
    }

    threat.count += 1;
    threat.nearestRadiusM = Math.min(threat.nearestRadiusM, point.radiusM);
  }

  return SECTORS.map((sector) => threats.get(sector) as SectorThreat);
}
