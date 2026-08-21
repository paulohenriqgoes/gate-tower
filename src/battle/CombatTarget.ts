import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * O que uma unidade pode perseguir e bater.
 *
 * Ate a JG-04 o alvo era sempre uma `TowerActor`: o combate era torre contra
 * torre, e `BaseUnit` guardava um `targetTower`. Na v3 isso deixou de valer nos
 * dois lados — o inimigo converge para a torre do JOGADOR (unica torre de
 * combate que sobrou) e a tropa do jogador nao tem torre para atacar, ela
 * defende um ponto do arco contra as UNIDADES que chegam. Alvo virou, entao,
 * "torre ou unidade", e este e o contrato minimo comum aos dois.
 *
 * Import de tipo apenas (`Vector3`), entao este modulo continua sem custo de
 * runtime e nao arrasta Babylon para quem so precisa da interface.
 */
export interface CombatTarget {
  /** Posicao no espaco LOCAL da arena (que, com o `arenaRoot` na origem, e o espaco do mundo). */
  getCombatPosition(): Vector3;
  isAlive(): boolean;
  receiveCombatDamage(amount: number): void;
  /**
   * Raio do CORPO do alvo, em metros. O atacante para a esta distancia alem do
   * proprio `contactRange`. Opcional: quem nao implementa vale 0, que e o
   * comportamento de sempre.
   *
   * Existe desde a JG-12, quando o alvo passou a ser o JOGADOR — e ele nao tem
   * malha. Enquanto o alvo era a torre, a geometria de 1,20 m ocupava o espaco e
   * ninguem precisava declarar nada; convergindo para um alvo sem corpo, o
   * inimigo encostaria na origem e bateria de dentro dos pes de quem joga, fora
   * do quadro da camera.
   */
  getBodyRadius?(): number;
}
