/**
 * O gatilho do Beat 5: **enquadrar a caverna e o que comeca a partida**.
 * Logica pura, sem Babylon.
 *
 * # Por que ele substitui o toque e a aproximacao
 *
 * O storyboard (quadro 04) e explicito: *"O Coelho Maluco tomando banho no
 * chapeu do cogumelo. 1-2 s de enquadramento continuo dispara"*, e o Ato 1
 * fecha com *"enquadrar e o gatilho — a primeira acao da partida e exatamente a
 * mecanica central do jogo. Nenhum texto de tutorial"*. O jogo nao fazia isso: o
 * `ProximityTrigger` pedia que o jogador ANDASSE ate ~45 cm da caverna, e o
 * toque na torre era o atalho que todo mundo acabava usando. Os dois ensinam o
 * gesto errado — a v3 nao pede deslocamento (`DR-1`) e nao quer HUD nem toque
 * como vocabulario de entrada.
 *
 * # Enquadrar aqui significa MIRAR, e nao "estar no quadro"
 *
 * Esta e a decisao que faz o gatilho funcionar depois de 2026-08-21, quando a
 * arena passou a caber inteira no FOV. Se "enquadrado" fosse "aparece na tela",
 * a caverna — que fica no azimute 0 — estaria enquadrada quase sempre, e a
 * partida comecaria sozinha em dois segundos, sem exploracao nenhuma e sem o
 * jogador entender o que fez.
 *
 * O criterio e o **cone de acao** (`DEPLOY_CONE_DEG`), o mesmo que decide onde
 * da para colocar carta e para onde a fireball sai. Assim o Beat 5 ensina, sem
 * uma linha de texto, o unico gesto que o jogo inteiro vai cobrar: virar o
 * celular ate a coisa ficar no meio da mira.
 *
 * # A licao que este arquivo herda
 *
 * O `ProximityTrigger` aprendeu, caro, que **leitura ausente congela a maquina**
 * — nao avanca nem zera. A mesma regra vale aqui: sem yaw valido (tracking
 * perdido, camera ainda nao pronta) o dwell nao acumula e tampouco e descartado.
 * Zerar por silencio de sensor puniria o jogador por um frame ruim do SLAM.
 */

import { normalizeAngleDeg } from "../arena/ArenaArc";

export interface FramingTriggerConfig {
  /**
   * Meia-largura do cone que conta como "mirado", em graus. Default:
   * `DEPLOY_CONE_DEG / 2`, o mesmo cone de acao do resto do jogo.
   */
  halfConeDeg: number;
  /** Quanto tempo de mira continua dispara, em ms. O storyboard pede 1-2 s. */
  dwellMs: number;
  /**
   * Histerese: uma vez dentro, so sai do cone ao passar deste valor a mais.
   * Sem ela, tremor de mao na fronteira faria o dwell zerar e recomecar sem
   * parar, e o gatilho nunca fecharia.
   */
  releaseMarginDeg: number;
}

export const DEFAULT_FRAMING_CONFIG: FramingTriggerConfig = {
  halfConeDeg: 10,
  dwellMs: 1500,
  releaseMarginDeg: 4,
};

/**
 * `away` — a caverna nao esta na mira.
 * `aiming` — esta na mira, acumulando tempo.
 * `triggered` — terminal, ate `reset()`.
 */
export type FramingStage = "away" | "aiming" | "triggered";

export class FramingTrigger {
  private readonly config: FramingTriggerConfig;

  private stage: FramingStage = "away";
  private dwellMs = 0;
  private lastUpdateMs: number | null = null;
  // Dentro do cone na leitura anterior — a histerese depende deste estado, e
  // nao so do angulo atual.
  private isInside = false;

  public constructor(config?: Partial<FramingTriggerConfig>) {
    this.config = { ...DEFAULT_FRAMING_CONFIG, ...config };
  }

  /**
   * Uma leitura de mira.
   *
   * @param offsetDeg quanto o alvo esta fora do centro da mira, em graus com
   *   sinal. `null` quando nao ha leitura — e o caso que CONGELA a maquina.
   * @param nowMs relogio, injetado para o teste nao depender do real.
   */
  public update(offsetDeg: number | null, nowMs: number): FramingStage {
    if (this.stage === "triggered") {
      return this.stage;
    }

    if (offsetDeg === null) {
      // Silencio de sensor nao e evidencia — nem a favor nem contra. Nao soma
      // tempo (o jogador pode ter virado para outro lado) e nao zera o que ja
      // foi acumulado. Tambem nao adianta o relogio: o proximo `update` com
      // leitura valida comeca a contar dali.
      this.lastUpdateMs = null;
      return this.stage;
    }

    const deltaMs = this.lastUpdateMs === null ? 0 : Math.max(0, nowMs - this.lastUpdateMs);
    this.lastUpdateMs = nowMs;

    const offset = Math.abs(normalizeAngleDeg(offsetDeg));
    const threshold = this.isInside
      ? this.config.halfConeDeg + this.config.releaseMarginDeg
      : this.config.halfConeDeg;

    this.isInside = offset <= threshold;

    if (!this.isInside) {
      // Saiu de verdade: o dwell tem de ser CONTINUO, pela mesma razao do
      // `ProximityTrigger` — olhar de relance tres vezes nao e olhar.
      this.dwellMs = 0;
      this.stage = "away";
      return this.stage;
    }

    this.dwellMs += deltaMs;
    this.stage = this.dwellMs >= this.config.dwellMs ? "triggered" : "aiming";

    return this.stage;
  }

  /**
   * Quanto do enquadramento ja foi cumprido, de 0 a 1. E o que alimenta o
   * brilho continuo da caverna: ela responde a cada fracao de segundo de mira,
   * e nao liga num degrau ao cruzar o limiar. E o feedback continuo que ensina
   * o gesto sem instrucao.
   */
  public getProgress(): number {
    if (this.stage === "triggered") {
      return 1;
    }

    return Math.min(1, Math.max(0, this.dwellMs / this.config.dwellMs));
  }

  public getStage(): FramingStage {
    return this.stage;
  }

  /** Volta ao inicio: sem dwell, sem historico de tempo, fora do cone. */
  public reset(): void {
    this.stage = "away";
    this.dwellMs = 0;
    this.lastUpdateMs = null;
    this.isInside = false;
  }
}
