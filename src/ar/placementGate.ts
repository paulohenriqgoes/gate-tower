import type { FootprintCoverage, GroundPlaneFit } from "./hitTestSampling";

export type PlacementPreviewState =
  | "waiting-tracking"  // trackingStatus !== "NORMAL" — sem fantasma; quem fala é o coaching overlay do 8th Wall
  | "searching"         // sem fit de plano sob o centro da tela
  | "out-of-frame"      // fit ok, mas cantos da arena fora do quadro -> "afaste o celular"
  | "too-small"         // cantos em quadro, mas fora do plano -> "aponte para uma superfície maior"
  | "ready"
  | "ready-degraded";   // escape de ambiente com pouca textura; precisão reduzida

/**
 * Quantas sondas precisam bater em superficie REAL fora do plano para o gate
 * recusar. Este e o coracao da politica: o gate recusa por PROVA CONTRARIA
 * (dois cantos caindo num degrau, tipicamente o chao abaixo da borda da mesa),
 * e nao por falta de prova a favor.
 *
 * A versao anterior exigia 6 de 8 sondas confirmadas sobre o plano. Em dois
 * testes de device isso produziu 79 recusas e zero ancoragens — porque o
 * hitTest simplesmente nao devolve nada em boa parte dos cantos, e silencio
 * nao e evidencia de que a superficie acabou. Dois vetos evitam que um unico
 * outlier de SLAM reprove uma mesa boa.
 */
export const MAX_OFF_PLANE_PROBES = 2;

/**
 * Quantas das 8 sondas precisam caber no quadro. Comecou em 8 (a arena INTEIRA
 * visivel) e o primeiro teste em device mostrou que isso e severo demais: o
 * contorno fica na fronteira do quadro na distancia natural de segurar o
 * celular, e o estado oscilava entre `out-of-frame` e `too-small` a cada
 * pequeno movimento. Com 6, uma borda fora do quadro nao trava o jogo.
 */
export const MIN_IN_FRAME_PROBES = 6;

/**
 * Quantos frames de falha consecutivos até sair de ready/ready-degraded.
 * A 5 Hz (5 updates por segundo), ~2 strikes = ~400 ms.
 */
export const EXIT_READY_STRIKES = 2;

export interface ResolvePreviewStateInput {
  trackingStatus: XR8TrackingStatus | null;
  hasFallbackUnlocked: boolean;
  fit: GroundPlaneFit | null;
  coverage: FootprintCoverage | null;
  previous: PlacementPreviewState;
  consecutiveFailures: number;
}

export interface ResolvePreviewStateOutput {
  state: PlacementPreviewState;
  consecutiveFailures: number;
}

/**
 * Lógica pura que decide qual é o estado do fantasma da arena em RA.
 * É o único lugar do sistema que responde "esse toque pode ancorar?".
 *
 * Implementa histerese na saída de ready/ready-degraded: uma única falha
 * não derruba o estado, mas 2 falhas seguidas (EXIT_READY_STRIKES) derrubam.
 * A perda de tracking (regra 1) derruba na hora, sem histerese.
 */
export function resolvePreviewState(input: ResolvePreviewStateInput): ResolvePreviewStateOutput {
  const {
    trackingStatus,
    hasFallbackUnlocked,
    fit,
    coverage,
    previous,
    consecutiveFailures
  } = input;

  // Regra 1: trackingStatus != "NORMAL" derruba na hora, sem histerese.
  // Se o fallback está desbloqueado E o status é "LIMITED", segue em ready-degraded.
  // Caso contrário, espera o tracking voltar.
  if (trackingStatus === null || trackingStatus !== "NORMAL") {
    if (hasFallbackUnlocked && trackingStatus === "LIMITED") {
      // Fallback ativo, mas pior resultado possível é ready-degraded.
      // Segue adiante para avaliar as outras regras.
    } else {
      // Tracking perdido ou não é "LIMITED" sem fallback.
      return { state: "waiting-tracking", consecutiveFailures: 0 };
    }
  }

  // Histerese na SAIDA de ready/ready-degraded: uma reprovacao isolada nao
  // derruba o estado. Vale para as regras 2, 3 e 4 — inclusive `searching`,
  // porque o hitTest do SLAM falha em frames avulsos e sem isso o contorno
  // piscaria com o proprio ruido da medicao. Entrar em ready continua imediato.
  const holdOrFail = (failed: PlacementPreviewState): ResolvePreviewStateOutput => {
    if (
      (previous === "ready" || previous === "ready-degraded")
      && consecutiveFailures + 1 < EXIT_READY_STRIKES
    ) {
      return { state: previous, consecutiveFailures: consecutiveFailures + 1 };
    }

    return { state: failed, consecutiveFailures: 0 };
  };

  // Regra 2: Sem fit de plano ou cobertura → searching.
  if (fit === null || coverage === null) {
    return holdOrFail("searching");
  }

  // Regra 3: Cantos saindo do quadro.
  if (coverage.inFrame < MIN_IN_FRAME_PROBES) {
    return holdOrFail("out-of-frame");
  }

  // Regra 4: prova contraria — cantos que bateram em superficie real fora do
  // plano da mesa. Sonda sem leitura NAO conta aqui, de proposito.
  if (coverage.offPlane >= MAX_OFF_PLANE_PROBES) {
    return holdOrFail("too-small");
  }

  // Caso contrário: arena ok. Se fallback está ativo, ready-degraded; senão, ready.
  // Qualquer aprovação zera o contador.
  const readyState = hasFallbackUnlocked && trackingStatus === "LIMITED"
    ? "ready-degraded"
    : "ready";

  return { state: readyState, consecutiveFailures: 0 };
}

/**
 * Único lugar que responde "esse toque ancora?".
 */
export function canPlace(state: PlacementPreviewState): boolean {
  return state === "ready" || state === "ready-degraded";
}

/**
 * Texto do HUD por estado; `null` = silêncio (o coaching overlay é quem fala).
 * Sem acento para consistência com o resto do projeto (veja EighthWallARManager.ts).
 */
export function placementMessage(state: PlacementPreviewState): string | null {
  switch (state) {
    case "waiting-tracking":
      // O coaching overlay do 8th Wall já fala nessa situação.
      return null;
    case "searching":
      return "Procurando uma superficie";
    case "out-of-frame":
      return "Afaste um pouco o celular";
    case "too-small":
      return "Aponte para uma superficie maior";
    case "ready":
      return null;
    case "ready-degraded":
      return "Precisao reduzida — o tamanho pode variar";
  }
}
