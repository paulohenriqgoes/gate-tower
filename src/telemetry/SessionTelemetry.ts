/**
 * Instrumentacao da sessao de demo do Tower Gate.
 *
 * Esta demo existe para responder UMA pergunta com pessoas reais testando:
 * "a pessoa acredita que apareceu um mundo vivo na mesa dela?". Os eventos e
 * metricas coletados aqui SAO o resultado do teste, nao debug interno.
 *
 * Metrica principal: `getBeat4DurationMs()`, o tempo entre a arena ser
 * ancorada (`arena_placed`) e o inimigo acordar (`enemy_awakened`). Abaixo de
 * 5s o mundo nao convenceu (a pessoa nao teve tempo de "ler" o espaco antes
 * da acao comecar); acima de 30s, a leitura do mundo foi validada.
 *
 * Zero dependencia de @babylonjs/core em runtime: o modulo e testavel em
 * Node puro. Callbacks como `getDistanceMeters` isolam qualquer acoplamento
 * com a engine 3D.
 */

export type TelemetryEvent =
  | { type: "arena_placed" }
  /**
   * Toque que nao ancorou, com o motivo vindo do gate de posicionamento
   * (`too-small`, `out-of-frame`, ...). Existe porque "colocar a arena exige
   * insistencia" era so relato: sem contar as recusas e o motivo delas, nao da
   * para saber se o conserto funcionou.
   */
  | {
      type: "placement_rejected";
      reason: string;
      inFrame: number;
      onPlane: number;
      offPlane: number;
      total: number;
    }
  | { type: "enemy_awakened" }
  /**
   * Estagio do gatilho de proximidade da torre inimiga (dorme -> espia ->
   * salta). E o que permite calibrar as distancias com dado em vez de
   * palpite: os limiares atuais sairam da sessao de 2026-08-14, onde a
   * mediana de distancia foi 1,91 m e o minimo 0,25 m. Sem este evento nao ha
   * como saber se a pessoa chegou a espiar e recuou, ou nem chegou perto.
   */
  | { type: "wake_stage_changed"; stage: string; distanceMeters: number }
  | { type: "camera_distance_sample"; meters: number }
  | { type: "card_deployed"; cardId: string; x: number; z: number; remainingMs: number }
  | { type: "deploy_cancelled" }
  | { type: "tracking_lost"; status: string }
  | { type: "tracking_recovered"; status: string }
  | { type: "match_ended"; result: "win" | "loss" | "draw"; playerHpPct: number; enemyHpPct: number };

export interface LoggedEvent {
  atMs: number;
  event: TelemetryEvent;
}

export interface SessionTelemetryOptions {
  now?: () => number;
}

interface SessionTelemetryExport {
  startedAtIso: string;
  minCameraDistanceMeters: number;
  beat4DurationMs: number | null;
  events: readonly LoggedEvent[];
}

const DEFAULT_CAMERA_SAMPLING_INTERVAL_MS = 500;

export class SessionTelemetry {
  private readonly now: () => number;
  private readonly startedAtMs: number;
  private readonly startedAtIso: string;
  private readonly events: LoggedEvent[] = [];

  private minCameraDistanceMeters = Infinity;
  private cameraSamplingHandle: number | null = null;

  public constructor(options?: SessionTelemetryOptions) {
    this.now = options?.now ?? (() => performance.now());
    this.startedAtMs = this.now();
    this.startedAtIso = new Date().toISOString();
  }

  public log(event: TelemetryEvent): void {
    this.events.push({ atMs: this.now() - this.startedAtMs, event });
  }

  public startCameraSampling(getDistanceMeters: () => number, intervalMs = DEFAULT_CAMERA_SAMPLING_INTERVAL_MS): void {
    // Limpa qualquer amostragem anterior para nunca ter dois timers rodando.
    // Usa globalThis (nao window) para o modulo continuar testavel em Node puro.
    this.stopCameraSampling();

    this.cameraSamplingHandle = globalThis.setInterval(() => {
      const meters = getDistanceMeters();
      this.recordCameraDistance(meters);
      this.log({ type: "camera_distance_sample", meters });
    }, intervalMs) as unknown as number;
  }

  public stopCameraSampling(): void {
    if (this.cameraSamplingHandle === null) {
      return;
    }

    globalThis.clearInterval(this.cameraSamplingHandle);
    this.cameraSamplingHandle = null;
  }

  public getMinCameraDistance(): number {
    return this.minCameraDistanceMeters;
  }

  public getEvents(): readonly LoggedEvent[] {
    return [...this.events];
  }

  public getBeat4DurationMs(): number | null {
    const placed = this.events.find((logged) => logged.event.type === "arena_placed");
    const awakened = this.events.find((logged) => logged.event.type === "enemy_awakened");

    if (!placed || !awakened) {
      return null;
    }

    return awakened.atMs - placed.atMs;
  }

  public exportJson(): string {
    const payload: SessionTelemetryExport = {
      startedAtIso: this.startedAtIso,
      minCameraDistanceMeters: this.minCameraDistanceMeters,
      beat4DurationMs: this.getBeat4DurationMs(),
      events: this.getEvents(),
    };

    return JSON.stringify(payload, null, 2);
  }

  public downloadJson(): void {
    const blob = new Blob([this.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `tower-gate-sessao-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  public dispose(): void {
    this.stopCameraSampling();
  }

  private recordCameraDistance(meters: number): void {
    if (!Number.isFinite(meters) || meters < 0) {
      return;
    }

    this.minCameraDistanceMeters = Math.min(this.minCameraDistanceMeters, meters);
  }
}
