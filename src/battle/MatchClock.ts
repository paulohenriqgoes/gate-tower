import { Observable } from "@babylonjs/core/Misc/observable";

export interface MatchClockOptions {
  /** Duracao total da partida em ms. Default: 3 minutos (180000). */
  durationMs?: number;
  /** Fonte de tempo injetavel, para teste deterministico. Default: `performance.now`. */
  now?: () => number;
}

const DEFAULT_DURATION_MS = 180_000;
/** `onFinalMinuteObservable` dispara quando o tempo restante cruza este limiar. */
const FINAL_MINUTE_THRESHOLD_MS = 60_000;

/**
 * Relogio de partida (Etapa 7). "A batalha nunca pausa, mesmo se a arena sair
 * completamente do quadro" (spec) — por isso o tempo e medido por RELOGIO DE
 * PAREDE (`now()`, diferenca entre agora e o instante de `start()`), nunca
 * por acumulo de deltaTime de frame.
 *
 * A diferenca importa: um relogio por deltaTime acumulado desacelera se o FPS
 * cair e congela se o app ficar sem renderizar (aba em segundo plano,
 * tracking do 8th Wall interrompido, frame perdido). Um relogio de parede
 * continua contando o tempo real dos dois lados — quando `tick()` volta a ser
 * chamado, `getRemainingMs()` ja reflete o tempo real decorrido, sem "dever"
 * nada dos frames perdidos. Isso e o que garante o requisito literal da spec:
 * mesmo 10s sem nenhum frame renderizado nao atrasa o relogio em 10s.
 *
 * `tick()` precisa ser chamado do render loop para os DOIS observables serem
 * detectados (a deteccao e por borda: "o restante cruzou o limiar desde a
 * ultima checagem") — sem chamadas de `tick()` o relogio ainda calcula o
 * tempo certo via `getRemainingMs()`/`getElapsedMs()`, so nao dispara os
 * eventos de borda.
 */
export class MatchClock {
  /** Dispara uma unica vez quando o tempo esgota. */
  public readonly onExpiredObservable = new Observable<void>();
  /** Dispara uma unica vez ao cruzar os 60s restantes, mesmo com `tick()` chamado 60x/s. */
  public readonly onFinalMinuteObservable = new Observable<void>();

  private readonly durationMs: number;
  private readonly now: () => number;

  private startedAtMs: number | null = null;
  private isRunningFlag = false;
  private hasExpired = false;
  private hasFiredFinalMinute = false;
  // Nao-nulo apos stop()/expiracao: congela o tempo lido dali em diante, em
  // vez de continuar calculando por now() (que so faria sentido enquanto o
  // relogio esta de fato correndo).
  private frozenElapsedMs: number | null = null;

  public constructor(options?: MatchClockOptions) {
    this.durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;
    this.now = options?.now ?? (() => performance.now());
  }

  /** Liga o relogio a partir de agora. Chamar de novo enquanto ja roda e no-op. */
  public start(): void {
    if (this.isRunningFlag) {
      return;
    }

    this.startedAtMs = this.now();
    this.isRunningFlag = true;
    this.hasExpired = false;
    this.hasFiredFinalMinute = false;
    this.frozenElapsedMs = null;
  }

  public isRunning(): boolean {
    return this.isRunningFlag;
  }

  public getElapsedMs(): number {
    if (this.frozenElapsedMs !== null) {
      return this.frozenElapsedMs;
    }

    if (this.startedAtMs === null) {
      return 0;
    }

    return Math.max(0, this.now() - this.startedAtMs);
  }

  public getRemainingMs(): number {
    return Math.max(0, this.durationMs - this.getElapsedMs());
  }

  /**
   * Chamar do render loop. Deteccao por borda: cada observable dispara na
   * primeira chamada de `tick()` em que a condicao passa a valer, nunca de
   * novo depois — e por isso que 60 chamadas por segundo nao produzem 60
   * disparos.
   */
  public tick(): void {
    if (!this.isRunningFlag) {
      return;
    }

    const elapsedMs = this.getElapsedMs();
    const remainingMs = Math.max(0, this.durationMs - elapsedMs);

    if (!this.hasFiredFinalMinute && remainingMs <= FINAL_MINUTE_THRESHOLD_MS) {
      this.hasFiredFinalMinute = true;
      this.onFinalMinuteObservable.notifyObservers();
    }

    if (!this.hasExpired && elapsedMs >= this.durationMs) {
      this.hasExpired = true;
      this.freeze(this.durationMs);
      this.onExpiredObservable.notifyObservers();
    }
  }

  /** Para o relogio e congela o tempo restante/decorrido no valor atual. */
  public stop(): void {
    if (!this.isRunningFlag) {
      return;
    }

    this.freeze(this.getElapsedMs());
  }

  public dispose(): void {
    this.stop();
    this.onExpiredObservable.clear();
    this.onFinalMinuteObservable.clear();
  }

  private freeze(elapsedMs: number): void {
    this.frozenElapsedMs = elapsedMs;
    this.isRunningFlag = false;
  }
}
