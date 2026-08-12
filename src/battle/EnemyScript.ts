/** Uma invocacao do script fixo do inimigo. */
export interface EnemyDeployment {
  /** Tempo decorrido de partida (ms) em que a invocacao dispara — `MatchClock.getElapsedMs()`. */
  atMs: number;
  /** Id de `CARD_CATALOG` (nao importado aqui para este arquivo continuar livre de qualquer dependencia). */
  cardId: string;
  /** Posicao LOCAL da arena (mesmo espaco de `CombatEngine.deployEnemyUnit`). */
  x: number;
  z: number;
}

/**
 * Script fixo de invocacoes do inimigo (Etapa 7). A spec deixa a IA em
 * aberto e autoriza explicitamente um "script fixo de invocacoes, nao precisa
 * ser adaptativa" — niveis de dificuldade e IA de verdade estao fora de
 * escopo desta etapa.
 *
 * As 4 cartas de `CARD_CATALOG` (javali-raivoso, tatu-bola, dona-barata,
 * cururu-bombado) aparecem distribuidas ao longo dos 3 minutos (180000ms) e
 * ADENSAM no ultimo minuto (a partir de 120000ms): os 5 primeiros disparos
 * cobrem 0-118s (~23,6s de intervalo medio), os 5 seguintes cobrem 128-176s
 * (~11,6s de intervalo medio) — a cadencia dobra, no mesmo espirito da
 * economia do jogador (cogumelo em dobro no ultimo minuto): o inimigo tambem
 * "ganha" mais recurso, mantendo a pressao coerente dos dois lados.
 *
 * A primeira entrada (`ENEMY_SCRIPT[0]`) e a carta que a torre inimiga revela
 * no Beat 5 (`TowerWakeup`) — ela precisa ser barata (o jogador ve a MESMA
 * carta que vai aparecer primeiro).
 *
 * Posicoes ficam do lado do inimigo (z > 0, dentro de x em [-8, 8] e z em
 * (0, 12], os limites reais da arena — ver `ArenaSystem.buildInitialArena`).
 * A maioria fica perto do caminho central (x em [-2, 2], a rota principal),
 * com algumas mais afastadas (ate x = ±3) para variar a leitura visual sem
 * fugir da faixa jogavel. Tabela fixa e determinista: sem `Math.random`.
 */
export const ENEMY_SCRIPT: EnemyDeployment[] = [
  { atMs: 12_000, cardId: "javali-raivoso", x: 0, z: 5 },
  { atMs: 34_000, cardId: "tatu-bola", x: -2, z: 6 },
  { atMs: 58_000, cardId: "dona-barata", x: 2, z: 5 },
  { atMs: 88_000, cardId: "cururu-bombado", x: 0, z: 7 },
  { atMs: 118_000, cardId: "javali-raivoso", x: -1, z: 6 },
  // Ultimo minuto (a partir de 120000ms): cadencia dobrada.
  { atMs: 128_000, cardId: "tatu-bola", x: 3, z: 5 },
  { atMs: 142_000, cardId: "dona-barata", x: -3, z: 7 },
  { atMs: 154_000, cardId: "javali-raivoso", x: 1, z: 6 },
  { atMs: 166_000, cardId: "cururu-bombado", x: 0, z: 8 },
  { atMs: 176_000, cardId: "javali-raivoso", x: -2, z: 5 },
];

export interface EnemyScriptRunnerOptions {
  /** Default: `ENEMY_SCRIPT`. Precisa estar ordenado por `atMs` crescente. */
  script?: EnemyDeployment[];
  onDeploy: (deployment: EnemyDeployment) => void;
}

/**
 * Executa o script fixo comparando tempo decorrido: puro tempo + callback,
 * ZERO Babylon. Quem quiser testar sem montar cena nenhuma testa isto direto
 * (ver `EnemyScript.test.ts`); quem liga a Babylon (posicao -> Vector3,
 * invocacao -> `CombatEngine.deployEnemyUnit`) e o `GameFlow`.
 */
export class EnemyScriptRunner {
  private readonly script: EnemyDeployment[];
  private readonly onDeploy: (deployment: EnemyDeployment) => void;

  // Proxima entrada a disparar. O script e assumido ordenado por `atMs`
  // crescente, entao um ponteiro que so avanca basta — sem isso precisaria
  // varrer o array inteiro (ou marcar "ja disparado" por entrada) a cada
  // update().
  private nextIndex = 0;

  public constructor(options: EnemyScriptRunnerOptions) {
    this.script = options.script ?? ENEMY_SCRIPT;
    this.onDeploy = options.onDeploy;
  }

  /** Dispara, em ordem, toda entrada cujo `atMs` ja foi alcancado — cada uma exatamente uma vez. */
  public update(elapsedMs: number): void {
    while (this.nextIndex < this.script.length && this.script[this.nextIndex].atMs <= elapsedMs) {
      const deployment = this.script[this.nextIndex];
      this.nextIndex += 1;
      this.onDeploy(deployment);
    }
  }

  /** Volta ao inicio do script (nova partida). */
  public reset(): void {
    this.nextIndex = 0;
  }
}
