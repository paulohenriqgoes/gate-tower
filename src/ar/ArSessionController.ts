import type { Observable } from "@babylonjs/core/Misc/observable";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { PlacementPreviewState } from "./placementGate";

/**
 * O resultado do fechamento da arena: o referencial contra o qual TODO angulo e
 * TODA posicao do jogo passam a ser medidos.
 *
 * A v3 e egocentrica — a arena nasce no jogador, nao num ponto tocado do chao
 * (spec §1). Por isso a ancora tem uma DIRECAO, e nao so um ponto: o azimute 0
 * do `ArenaArc` e a direcao em que o celular apontava no instante do
 * fechamento, e e a partir dela que "esquerda", "centro" e "direita" existem.
 */
export interface ArenaAnchor {
  /** Origem da arena: o device projetado no piso estimado. E o vertice do arco. */
  origin: Vector3;
  /**
   * Heading do device no fechamento, em graus, na convencao de
   * `src/ar/arenaHeading.ts` (0 = -Z do mundo, positivo para a direita). Vira o
   * azimute 0 do `ArenaArc`.
   */
  forwardYawDeg: number;
  /** Altura do piso medido, em coordenada de mundo. */
  floorY: number;
}

/**
 * Recusa de fechamento com a medicao que a produziu. As contagens vao junto
 * porque o motivo sozinho nao discrimina: `blocked` com `offPlane: 4` e um
 * obstaculo de verdade, enquanto `blocked` com tudo zerado e o hitTest nao
 * tendo devolvido nada — dois problemas opostos sob o mesmo rotulo, e foi
 * preciso um teste de device inteiro para descobrir qual dos dois era.
 */
export interface PlacementRejection {
  reason: PlacementPreviewState;
  inFrame: number;
  onPlane: number;
  offPlane: number;
  total: number;
}

/**
 * Contrato da sessao de RA visto pelo fluxo de jogo. Existe para inverter a
 * dependencia: o `GameFlow` fala com esta abstracao, nunca com o engine do
 * 8th Wall — e a regra de "logica de jogo independente do modo de render"
 * continua valendo.
 */
export interface ArSessionController {
  /**
   * Arena fechada em volta do jogador, com a ancora resultante. E o fim do
   * setup de RA e o inicio do Beat 4 (`world-alive`): nao existe uma
   * confirmacao intermediaria — fechar JA e comecar o mundo vivo.
   */
  readonly onArenaClosedObservable: Observable<ArenaAnchor>;
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
  /**
   * Toque que nao ancorou, com o estado do preview que o recusou. Mesma razao
   * de existir do observable acima: alimentar a telemetria da sessao de teste
   * sem que o AR Manager precise conhecer a telemetria.
   */
  readonly onPlacementRejectedObservable: Observable<PlacementRejection>;

  /** Engine carregado e device compativel. */
  isARAvailable(): boolean;
  isSessionActive(): boolean;
  enterAR(): Promise<void>;
  exitAR(): void;
  /** Volta para a fase de fechamento sem derrubar a sessao. */
  repositionArena(): void;
  /**
   * Tenta fechar a arena na posicao atual do jogador. Quem chama e o
   * `WorldTapRouter` — o AR Manager nao assina mais o ponteiro por conta
   * propria.
   *
   * Devolve `true` quando o toque PERTENCE ao fechamento (a sessao esta no modo
   * de setup), mesmo que o gate tenha recusado. `false` significa "esse toque
   * nao e meu" — e o que permite chamar isto tambem nas fases seguintes: o
   * botao "Reposicionar" de `?debug=1` devolve a sessao ao modo de setup no
   * meio do jogo, e sem essa consulta o toque de reancoragem nunca chegaria ate
   * aqui.
   */
  tryCloseArenaAtPlayer(): boolean;
  /**
   * Yaw da camera em relacao ao azimute 0 da arena, em graus, positivo para a
   * direita do jogador. 0 antes do fechamento.
   *
   * Esta no CONTRATO, e nao so no AR Manager, porque e o insumo de
   * `framedSectors`/`pickSpawnSector` — ou seja, de onde o inimigo nasce e do
   * que o jogador esta vendo. Se o modo tela nao souber responder isto, metade
   * da v3 deixa de ser testavel fora do celular, e a regra de "logica de jogo
   * independente do modo de render" morre na primeira etapa que dependa de
   * angulo.
   */
  getCameraYawDeg(): number;
  /** Ancoragem vigente, ou `null` enquanto a arena nao fechou. */
  getArenaAnchor(): ArenaAnchor | null;
}
