/**
 * Estados do preview de fechamento da arena.
 *
 * A v3 trocou a pergunta do gate. Antes era "cabe um retangulo de 80 cm nessa
 * superficie?", e os estados falavam de contorno (`out-of-frame`,
 * `too-small`). Agora a arena nasce NO JOGADOR, entao a pergunta virou "da para
 * fechar um arco de 2,2 m ao redor de quem esta aqui?" — e ela se decompoe em
 * achar o piso e confirmar que o device esta a altura de alguem em pe.
 *
 * ## Por que nao existe um estado de obstaculo
 *
 * Existiu: `blocked`, alimentado por dez sondas de hitTest dentro do raio
 * minimo de colocacao. O primeiro teste em device mediu **1 sonda em quadro de
 * 10**, sempre — as sondas ficam no chao a menos de 90 cm de quem segura o
 * celular a 1,20 m olhando para a frente, o que e ~55 graus abaixo do
 * horizonte, fora da borda inferior da tela. Com uma sonda em quadro o limiar
 * (minimo 2) era inalcancavel: a regra NUNCA podia disparar.
 *
 * Nao foi consertada, foi removida, por tres razoes que valem registro:
 *
 * 1. Acumular leituras entre frames seria o conserto obvio e esta ERRADO aqui:
 *    as sondas vivem no espaco local da arena e o contorno gira com o jogador,
 *    entao a sonda de indice 3 e um azimute fixo em relacao ao ROSTO dele, nao
 *    um ponto fixo do mundo. Somar leituras por indice misturaria lugares
 *    diferentes.
 * 2. Este stack nao tem oclusao real (plano §5). Um movel "dentro" da arena ja
 *    e invisivel para o jogo — a regra protegia contra um problema estetico.
 * 3. A pergunta "esse lugar esta livre?" tem casa natural na Etapa 6, no anel
 *    de colocacao: la o jogador ESTA olhando para o ponto, a sonda cai no
 *    centro da tela, e a resposta muda onde a tropa nasce. Aqui ela era
 *    irrespondivel e inconsequente.
 *
 * A assimetria que fechou a decisao: um "blocked" falso ja custou 79 recusas e
 * zero ancoragens em dois testes de device. Um bloqueio ausente custa o jogador
 * ver um cogumelo dentro do sofa.
 */
export type PlacementPreviewState =
  | "waiting-tracking"  // trackingStatus !== "NORMAL" — quem fala e o coaching overlay do 8th Wall
  | "searching"         // sem fit de plano na faixa de chao a frente
  | "bad-height"        // piso achado, mas a altura do device nao e a de alguem em pe
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
  // derruba o estado. Vale para as regras 2 e 3 — inclusive `searching`,
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
    case "ready":
    case "ready-degraded":
      return "ok";
  }
}
