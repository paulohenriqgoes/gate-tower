import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { CombatTarget } from "../battle/CombatTarget";

/**
 * O JOGADOR como alvo de combate (JG-12).
 *
 * Ate a JG-04 quem apanhava era uma torre-cogumelo de 1,20 m parada no vertice
 * do arco, a 0,9 m de quem joga. Ela saiu por duas razoes, e as duas foram
 * medidas:
 *
 * 1. **Ela vivia dentro do quadro.** Na sessao de device de 2026-08-21, 57,7%
 *    das amostras de distancia da camera ja estavam dentro do fade (< 1,2 m),
 *    6,4% com a torre inteiramente invisivel e 2,7% abaixo de 0,4 m — ou seja,
 *    o jogador passava boa parte da partida com a camera dentro da propria
 *    torre. O diagnostico do dono do projeto foi mais curto: "deixou o game um
 *    caos".
 * 2. **Ela vencia a partida sozinha.** Com 1,0 m de alcance e ataque
 *    automatico, matava tudo que chegava perto: as duas partidas daquela sessao
 *    terminaram em vitoria com 100% e 99,1% de vida. Nao havia jogo.
 *
 * Quem defende, agora, e carta — e o recurso de emergencia e a fireball, que
 * custa 1 cogumelo, ou seja, custa uma carta que o jogador nao jogou.
 *
 * **Por que a posicao e a origem, e nao a camera.** `getSectorThreats()`,
 * `evaluatePlacement` e o `WaveDirector` medem azimute e raio a partir da
 * ORIGEM. Se o alvo andasse junto com a camera, a seta de flanco da JG-05
 * apontaria para um setor calculado de um centro tendo o alvo em outro, e as
 * duas leituras divergiriam sem nada ter acontecido. A v3 declara que o jogador
 * *e* o vertice do arco e nao pede deslocamento (`DR-1`): manter o alvo na
 * origem e o que mantem uma fonte de verdade so. O que anda preso a camera e o
 * feedback de dano, nao o alvo.
 *
 * Sem Babylon alem do `Vector3`: nao ha malha, nao ha cena, nao ha observador
 * de frame. E por isso que ele e testavel sem engine nenhum.
 */
export interface PlayerCoreOptions {
  /** Raio do corpo, em metros — o inimigo para a esta distancia (`PLAYER_BODY_RADIUS_M`). */
  bodyRadius: number;
  /** Altura do "chao" da arena: o mesmo `unitGroundY` em que as tropas andam. */
  groundY: number;
  maxHealth: number;
}

export class PlayerCore implements CombatTarget {
  public readonly maxHealth: number;

  private readonly bodyRadius: number;
  // Reutilizado a cada leitura em vez de alocar por frame: `getCombatPosition`
  // e chamado por unidade viva por frame, e o valor nunca muda.
  private readonly position: Vector3;

  private health: number;

  public constructor(options: PlayerCoreOptions) {
    this.bodyRadius = options.bodyRadius;
    this.maxHealth = options.maxHealth;
    this.health = options.maxHealth;
    this.position = new Vector3(0, options.groundY, 0);
  }

  public getHealth(): number {
    return this.health;
  }

  public isAlive(): boolean {
    return this.health > 0;
  }

  // --- CombatTarget

  public getCombatPosition(): Vector3 {
    return this.position;
  }

  public getBodyRadius(): number {
    return this.bodyRadius;
  }

  public receiveCombatDamage(amount: number): void {
    if (!this.isAlive()) {
      return;
    }

    this.health = Math.max(0, this.health - amount);
  }

  /** Vida cheia para a partida seguinte. Mesmo contrato do antigo `TowerActor.reset()`. */
  public reset(): void {
    this.health = this.maxHealth;
  }
}
