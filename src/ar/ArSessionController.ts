import type { Observable } from "@babylonjs/core/Misc/observable";

/**
 * O fechamento da arena, com o contexto que permite julgar a sessao depois do
 * fato.
 *
 * Ele encolheu na spec 08 (F2), e o que sumiu conta a historia: nao ha mais
 * `origin`, `forwardYawDeg` nem `floorY`. A arena deixou de ser POSICIONADA e
 * passou a ser AUTORADA na origem — `arenaRoot` fica em (0,0,0) com rotacao
 * identidade para sempre, o piso e o `y = 0` do mundo por declaracao (a camera
 * de RA nasce na altura do jogador, entao o chao cai em zero de graca no frame
 * zero) e o azimute 0 e o +Z do mundo.
 *
 * Sem ponto e sem direcao para reportar, sobra o unico dado que o fechamento
 * ainda produz e que ninguem consegue reconstruir depois: em que qualidade de
 * tracking ele aconteceu.
 */
export interface ArenaClosedReport {
  /** Status de tracking do SLAM no instante do fechamento. */
  trackingStatus: XR8TrackingStatus | null;
}

/**
 * Contrato da sessao de RA visto pelo fluxo de jogo. Existe para inverter a
 * dependencia: o `GameFlow` fala com esta abstracao, nunca com o engine do
 * 8th Wall — e a regra de "logica de jogo independente do modo de render"
 * continua valendo.
 */
export interface ArSessionController {
  /**
   * Arena confirmada pelo jogador. E o fim do setup de RA e o inicio do Beat 4
   * (`world-alive`): nao existe uma confirmacao intermediaria — confirmar JA e
   * comecar o mundo vivo.
   *
   * Desde a F2 esta confirmacao NAO PODE SER RECUSADA. Nao ha medicao de piso,
   * nao ha gate de colocacao, nao ha superficie a encontrar: a arena ja esta na
   * origem desde o primeiro frame da sessao, e o toque so diz "agora".
   */
  readonly onArenaClosedObservable: Observable<ArenaClosedReport>;
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
  /**
   * Confirma a arena e entra no mundo vivo. Quem chama e o `WorldTapRouter`.
   *
   * Devolve `true` quando o toque PERTENCE a confirmacao (a sessao esta no modo
   * de setup). `false` significa "esse toque nao e meu" — e o que permite
   * chamar isto tambem nas fases seguintes: o botao "Reposicionar" de
   * `?debug=1` devolve a sessao ao modo de setup no meio do jogo, e sem essa
   * consulta o toque de reconfirmacao nunca chegaria ate aqui.
   */
  tryCloseArenaAtPlayer(): boolean;
  /**
   * Yaw da camera em relacao ao azimute 0 da arena, em graus, positivo para a
   * direita do jogador.
   *
   * Esta no CONTRATO, e nao so no AR Manager, porque e o insumo de
   * `framedSectors`/`pickSpawnSector` — ou seja, de onde o inimigo nasce e do
   * que o jogador esta vendo. Se o modo tela nao souber responder isto, metade
   * da v3 deixa de ser testavel fora do celular, e a regra de "logica de jogo
   * independente do modo de render" morre na primeira etapa que dependa de
   * angulo.
   *
   * Desde a F2 nao ha ancora a subtrair: a arena esta na origem sem rotacao,
   * entao o heading do mundo JA e o yaw relativo ao azimute 0 do arco.
   */
  getCameraYawDeg(): number;
}
