export type TeamId = "player" | "enemy";

export type TowerLaneId = "left" | "center" | "right";

/** Resultado de uma partida (Etapa 7): vitoria/derrota sao do ponto de vista do JOGADOR. */
export type MatchResult = "win" | "loss" | "draw";

/** Payload de `GameFlow.onMatchOverObservable` — mesmo shape do evento `match_ended` da telemetria. */
export interface MatchOverPayload {
  result: MatchResult;
  playerHpPct: number;
  enemyHpPct: number;
}

/**
 * Desempate por tempo esgotado: vence quem tem maior percentual de HP da
 * torre; percentuais iguais (inclusive 0% vs 0%, as duas torres destruidas
 * juntas) e empate. Funcao pura, sem Babylon nem GameFlow/CombatEngine, para
 * testar a regra de desempate isolada do resto da orquestracao.
 */
export function resolveMatchResultByHpPct(playerHpPct: number, enemyHpPct: number): MatchResult {
  if (playerHpPct > enemyHpPct) {
    return "win";
  }

  if (enemyHpPct > playerHpPct) {
    return "loss";
  }

  return "draw";
}
