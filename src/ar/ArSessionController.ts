import type { Observable } from "@babylonjs/core/Misc/observable";

/**
 * Contrato da sessao de RA visto pelo fluxo de jogo. Existe para inverter a
 * dependencia: o `GameFlow` fala com esta abstracao, nunca com o engine do
 * 8th Wall — e a regra de "logica de jogo independente do modo de render"
 * continua valendo.
 */
export interface ArSessionController {
  /**
   * Arena ancorada no piso real pelo toque do jogador. E o fim do setup de RA
   * e o inicio do Beat 4 (`world-alive`): nao existe mais uma confirmacao
   * intermediaria — ancorar JA e comecar o mundo vivo.
   */
  readonly onArenaPlacedObservable: Observable<void>;
  /** Sessao caiu ou nao subiu; carrega a mensagem que o menu exibe. */
  readonly onSessionFailedObservable: Observable<string>;
  /**
   * Disponibilidade da RA mudou. O engine carrega de forma assincrona, entao o
   * menu abre com o botao de RA esmaecido e so libera quando isso dispara.
   */
  readonly onAvailabilityChangedObservable: Observable<boolean>;
  /**
   * Qualidade de tracking reportada pelo SLAM mudou (NORMAL, LIMITED, ...).
   * Alimenta os eventos `tracking_lost`/`tracking_recovered` da telemetria da
   * sessao de teste.
   */
  readonly onTrackingStatusChangedObservable: Observable<XR8TrackingStatus>;

  /** Engine carregado e device compativel. */
  isARAvailable(): boolean;
  isSessionActive(): boolean;
  enterAR(): Promise<void>;
  exitAR(): void;
  /** Volta para a fase de posicionamento sem derrubar a sessao. */
  repositionArena(): void;
  /**
   * Tenta ancorar a arena no ponto atual do ponteiro. Quem chama e o
   * `WorldTapRouter` — o AR Manager nao assina mais o ponteiro por conta
   * propria.
   *
   * Devolve `true` quando o toque PERTENCE a ancoragem (a sessao esta no modo
   * de posicionamento), mesmo que a superficie tenha sido recusada. `false`
   * significa "esse toque nao e meu" — e o que permite chamar isto tambem nas
   * fases seguintes: o botao "Reposicionar" de `?debug=1` devolve a sessao ao
   * modo de posicionamento no meio do jogo, e sem essa consulta o toque de
   * reancoragem nunca chegaria ate aqui.
   */
  tryPlaceArenaAtPointer(): boolean;
}
