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
}
