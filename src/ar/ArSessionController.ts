import type { Observable } from "@babylonjs/core/Misc/observable";

/**
 * Contrato da sessao de RA visto pelo fluxo de jogo. Existe para inverter a
 * dependencia: o `GameFlow` fala com esta abstracao, nunca com o engine do
 * 8th Wall — e a regra de "logica de jogo independente do modo de render"
 * continua valendo.
 */
export interface ArSessionController {
  /** Arena ancorada no piso real pelo toque do jogador. */
  readonly onArenaPlacedObservable: Observable<void>;
  /** Jogador confirmou o posicionamento no botao "Comecar". */
  readonly onMatchStartRequestedObservable: Observable<void>;
  /** Sessao caiu ou nao subiu; carrega a mensagem que o menu exibe. */
  readonly onSessionFailedObservable: Observable<string>;
  /**
   * Disponibilidade da RA mudou. O engine carrega de forma assincrona, entao o
   * menu abre com o botao de RA esmaecido e so libera quando isso dispara.
   */
  readonly onAvailabilityChangedObservable: Observable<boolean>;

  /** Engine carregado e device compativel. */
  isARAvailable(): boolean;
  isSessionActive(): boolean;
  enterAR(): Promise<void>;
  exitAR(): void;
  /** Volta para a fase de posicionamento sem derrubar a sessao. */
  repositionArena(): void;
  /** Encerra a fase de setup: some com o painel de setup e o coaching overlay. */
  completeSetup(): void;
}
