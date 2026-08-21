export type TeamId = "player" | "enemy";

export type TowerLaneId = "left" | "center" | "right";

/**
 * Resultado de uma partida, do ponto de vista do JOGADOR.
 *
 * O empate morreu na JG-04. Ele existia para desempatar HP de torre contra HP
 * de torre quando o tempo acabava — e nao ha mais duas torres: a unica torre de
 * combate e a do jogador (`DJ-5`, derrota = a torre cair). Chegar ao fim dos 3
 * minutos com a torre em pe passou a ser, sozinho, a vitoria.
 */
export type MatchResult = "win" | "loss";

/** Payload de `GameFlow.onMatchOverObservable` — mesmo shape do evento `match_ended` da telemetria. */
export interface MatchOverPayload {
  result: MatchResult;
  playerHpPct: number;
  /**
   * Criaturas inimigas abatidas na partida. Substituiu o `enemyHpPct`, que era
   * a vida da torre inimiga — um numero que deixou de existir. E tambem a
   * leitura que interessa daqui para frente: e o tamanho da recompensa, ja que
   * todo derrotado vira carta no album (spec v3 §8), inclusive em derrota.
   */
  enemiesDefeated: number;
}
