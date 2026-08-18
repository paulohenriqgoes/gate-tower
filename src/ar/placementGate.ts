import type { ProbeCoverage } from "./hitTestSampling";

/**
 * Estados do preview de fechamento da arena.
 *
 * A v3 trocou a pergunta do gate. Antes era "cabe um retangulo de 80 cm nessa
 * superficie?", e os estados falavam de contorno (`out-of-frame`,
 * `too-small`). Agora a arena nasce NO JOGADOR, entao a pergunta virou "da
 * para fechar um arco de 2,2 m ao redor de quem esta aqui?" — e ela se decompoe
 * em achar o piso, confirmar que o device esta a altura de alguem em pe, e nao
 * ter prova de obstaculo no entorno imediato.
 */
export type PlacementPreviewState =
  | "waiting-tracking"  // trackingStatus !== "NORMAL" — quem fala e o coaching overlay do 8th Wall
  | "searching"         // sem fit de plano na faixa de chao a frente
  | "bad-height"        // piso achado, mas a altura do device nao e a de alguem em pe
  | "blocked"           // PROVA CONTRARIA: sondas bateram em superficie fora do piso
  | "ready"
  | "ready-degraded";   // escape de ambiente com pouca textura; precisao reduzida

/**
 * Faixa de altura do device acima do piso encontrado, em metros.
 *
 * Nao e conforto: e o unico teste barato que separa "achei o chao" de "achei a
 * mesa da sala" e de "a escala absoluta ainda nao convergiu". Alguem de pe
 * segurando o celular fica entre ~1,2 m e ~1,7 m; a faixa e folgada dos dois
 * lados para caber crianca, braco estendido para baixo e o erro do proprio
 * fit. Abaixo de 0,8 m o "piso" e movel; acima de 2,0 m ou a pessoa esta numa
 * escada ou a escala saiu errada — nos dois casos a arena de 2,2 m de raio
 * nasceria com o tamanho errado.
 */
export const MIN_DEVICE_HEIGHT_M = 0.8;
export const MAX_DEVICE_HEIGHT_M = 2.0;

/**
 * Piso ABSOLUTO de sondas com prova contraria para reprovar. Existe para que um
 * unico outlier do SLAM nunca reprove um chao bom — foi assim que o gate se
 * comportava antes da inversao da politica, e custou 79 recusas e zero
 * ancoragens em dois testes de device.
 */
export const MIN_BLOCKING_PROBES = 2;

/**
 * Fracao das sondas EM QUADRO que precisa dar prova contraria para reprovar.
 *
 * O limiar e uma FRACAO, e nao o `2` herdado da contagem de 8 sondas do
 * contorno retangular: a quantidade de sondas mudou (agora sao aneis dentro do
 * raio minimo de colocacao) e vai mudar de novo quando o arco for reajustado.
 * Um numero absoluto amarrado a uma contagem que nao existe mais e um limiar
 * que ninguem sabe mais recalibrar.
 *
 * O denominador e `inFrame`, e nao `total`: sonda fora do quadro nao foi
 * testada, entao nao pode diluir nem endurecer o criterio. 0,25 preserva a
 * severidade medida em device — com as 8 sondas antigas, `ceil(0,25 * 8) = 2`,
 * exatamente o limiar que funcionou.
 */
export const BLOCKING_PROBE_FRACTION = 0.25;

/**
 * Quantas sondas com prova contraria reprovam, dado quantas estao em quadro.
 * Nunca menos que `MIN_BLOCKING_PROBES`.
 */
export function blockingProbeThreshold(inFrameProbes: number): number {
  return Math.max(MIN_BLOCKING_PROBES, Math.ceil(BLOCKING_PROBE_FRACTION * Math.max(0, inFrameProbes)));
}

/**
 * Quantos frames de falha consecutivos até sair de ready/ready-degraded.
 * A 5 Hz (5 updates por segundo), ~2 strikes = ~400 ms.
 */
export const EXIT_READY_STRIKES = 2;

export interface ResolvePreviewStateInput {
  trackingStatus: XR8TrackingStatus | null;
  hasFallbackUnlocked: boolean;
  /**
   * Altura do device acima do piso estimado, em metros, ou `null` quando nao
   * houve fit de plano nenhum. Um numero puro em vez do `GroundPlaneFit`
   * inteiro: o gate nao precisa de geometria, so do veredito de altura, e
   * assim ele fica livre de Babylon.
   */
  deviceHeightM: number | null;
  /**
   * Sondas de desobstrucao. `null` significa "nao medi" (nao houve piso para
   * projetar as sondas contra), e NAO reprova — ver a regra 4.
   */
  coverage: ProbeCoverage | null;
  previous: PlacementPreviewState;
  consecutiveFailures: number;
}

export interface ResolvePreviewStateOutput {
  state: PlacementPreviewState;
  consecutiveFailures: number;
}

/**
 * Lógica pura que decide se a arena pode fechar aqui.
 * É o único lugar do sistema que responde "esse fechamento pode?".
 *
 * Implementa histerese na saída de ready/ready-degraded: uma única falha
 * não derruba o estado, mas 2 falhas seguidas (EXIT_READY_STRIKES) derrubam.
 * A perda de tracking (regra 1) derruba na hora, sem histerese.
 */
export function resolvePreviewState(input: ResolvePreviewStateInput): ResolvePreviewStateOutput {
  const {
    trackingStatus,
    hasFallbackUnlocked,
    deviceHeightM,
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
  // porque o hitTest do SLAM falha em frames avulsos e sem isso o arco
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

  // Regra 2: sem piso, nao ha onde a arena nascer.
  //
  // Esta e a UNICA exigencia de prova positiva do gate, e ela e legitima
  // porque a medicao correspondente e barata e confiavel: a faixa amostrada
  // fica na metade inferior da tela, onde o chao a frente de quem esta de pe
  // sempre aparece — nao e um canto distante em incidencia rasa, que e onde o
  // hitTest fica mudo.
  if (deviceHeightM === null) {
    return holdOrFail("searching");
  }

  // Regra 3: a altura do device denuncia piso errado ou escala nao convergida.
  if (deviceHeightM < MIN_DEVICE_HEIGHT_M || deviceHeightM > MAX_DEVICE_HEIGHT_M) {
    return holdOrFail("bad-height");
  }

  // Regra 4: PROVA CONTRARIA de obstaculo no entorno imediato.
  //
  // Repare no que NAO esta aqui: `coverage === null` (nao medi) e
  // `coverage.onPlane === 0` (mediram e nada respondeu) nao reprovam nada.
  // Silencio do sensor e "nao sei", nunca "nao pode" — inverter isso reproduz
  // o bug que custou 79 recusas e zero ancoragens em dois testes de device.
  // So reprova sonda que BATEU em superficie real fora do plano do piso.
  if (coverage !== null && coverage.offPlane >= blockingProbeThreshold(coverage.inFrame)) {
    return holdOrFail("blocked");
  }

  // Caso contrário: da para fechar. Se fallback está ativo, ready-degraded;
  // senão, ready. Qualquer aprovação zera o contador.
  const readyState = hasFallbackUnlocked && trackingStatus === "LIMITED"
    ? "ready-degraded"
    : "ready";

  return { state: readyState, consecutiveFailures: 0 };
}

/**
 * Único lugar que responde "a arena fecha agora?".
 */
export function canPlace(state: PlacementPreviewState): boolean {
  return state === "ready" || state === "ready-degraded";
}

/**
 * Texto do HUD por estado; `null` = silêncio (o coaching overlay é quem fala).
 * Sem acento para consistência com o resto do projeto (veja EighthWallARManager.ts).
 *
 * As frases mudaram de assunto junto com o gate: não existe mais "mire e toque
 * no chão", porque não há mais ponto de toque. O que se pede agora é postura —
 * ficar de pé, apontar para a frente — e o toque só confirma.
 */
export function placementMessage(state: PlacementPreviewState): string | null {
  switch (state) {
    case "waiting-tracking":
      // O coaching overlay do 8th Wall já fala nessa situação.
      return null;
    case "searching":
      return "Aponte o celular para o chao a sua frente";
    case "bad-height":
      return "Fique de pe e segure o celular na frente do corpo";
    case "blocked":
      return "Abra espaco a sua volta";
    case "ready":
      return null;
    case "ready-degraded":
      return "Precisao reduzida — a arena pode nascer torta";
  }
}

/**
 * Motivo legivel por maquina para `canCloseArena()`. Diferente de
 * `placementMessage`, que e texto de jogador: aqui o consumidor e codigo
 * (telemetria, painel de debug, o botao de fechar), e por isso todo estado tem
 * resposta — inclusive os que nao mostram nada na tela.
 */
export function placementReason(state: PlacementPreviewState): string {
  switch (state) {
    case "waiting-tracking":
      return "tracking-nao-calibrado";
    case "searching":
      return "piso-nao-encontrado";
    case "bad-height":
      return "altura-do-device-fora-da-faixa";
    case "blocked":
      return "obstaculo-no-entorno";
    case "ready":
    case "ready-degraded":
      return "ok";
  }
}
