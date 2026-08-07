import type { Observer } from "@babylonjs/core/Misc/observable";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import type { ArSessionController } from "../ar/ArSessionController";
import type { CardDeckSystem } from "../cards/CardDeckSystem";
import type { CombatEngine } from "../combat/CombatEngine";
import type { CardDeckHud } from "../ui/CardDeckHud";
import type { HudLayer } from "../ui/HudLayer";
import type { StartScreen } from "../ui/StartScreen";
import { installImmersiveModeOnGesture } from "../ui/screenOrientation";
import type { GameMode, GamePhase } from "./GameTypes";

export interface GameFlowOptions {
  arManager: ArSessionController;
  arenaRoot: TransformNode;
  canvas: HTMLCanvasElement;
  cardDeckHud: CardDeckHud;
  cardDeckSystem: CardDeckSystem;
  combatEngine: CombatEngine;
  hudLayer: HudLayer;
  startScreen: StartScreen;
}

// Classe do CSS de index.html que liga o overlay de "gire o celular"; so faz
// sentido no modo tela, nunca em RA (ver politica de orientacao por modo).
const LANDSCAPE_BODY_CLASS = "needs-landscape";

/**
 * Orquestrador unico do fluxo de jogo. Liga e desliga cada subsistema
 * conforme a fase (`menu`, `ar-setup`, `playing`) — e o unico modulo que
 * conhece todos os outros; nenhum deles conhece este.
 */
export class GameFlow {
  private readonly options: GameFlowOptions;

  private phase: GamePhase = "menu";
  // Modo escolhido na tela inicial. So existe a partir da primeira escolha;
  // decide se `playing` pode mexer em `arenaRoot.setEnabled` (ver spec).
  private mode: GameMode | null = null;
  // `installImmersiveModeOnGesture` so pode ser chamado uma vez por gesto
  // instalado; reinstalar a cada volta ao menu duplicaria o listener.
  private hasInstalledImmersiveGesture = false;
  private isDisposed = false;

  private readonly modeSelectedObserver: Observer<GameMode>;
  private readonly matchStartRequestedObserver: Observer<void>;
  private readonly sessionFailedObserver: Observer<string>;

  public constructor(options: GameFlowOptions) {
    this.options = options;

    this.modeSelectedObserver = options.startScreen.onModeSelectedObservable.add((mode) => {
      this.handleModeSelected(mode);
    });

    this.matchStartRequestedObserver = options.arManager.onMatchStartRequestedObservable.add(() => {
      this.handleMatchStartRequested();
    });

    this.sessionFailedObserver = options.arManager.onSessionFailedObservable.add((message) => {
      this.handleSessionFailed(message);
    });
  }

  /** Entra na fase `menu`. Chamar uma vez, no bootstrap. */
  public start(): void {
    this.setPhase("menu");
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    this.options.startScreen.onModeSelectedObservable.remove(this.modeSelectedObserver);
    this.options.arManager.onMatchStartRequestedObservable.remove(this.matchStartRequestedObserver);
    this.options.arManager.onSessionFailedObservable.remove(this.sessionFailedObserver);
  }

  private handleModeSelected(mode: GameMode): void {
    if (this.phase !== "menu") {
      return;
    }

    this.mode = mode;
    this.options.startScreen.setMessage("");

    if (mode === "canvas") {
      this.applyCanvasOrientationPolicy();
      this.setPhase("playing");
      return;
    }

    this.applyArOrientationPolicy();
    // A fase entra ANTES de `enterAR`: o caminho de "RA indisponivel" notifica
    // a falha de forma sincrona, e se a fase so mudasse depois esse setPhase
    // sobrescreveria a volta ao menu — o jogo ficaria em `ar-setup` sem menu e
    // sem sessao.
    this.setPhase("ar-setup");
    void this.options.arManager.enterAR();
  }

  private handleMatchStartRequested(): void {
    if (this.phase !== "ar-setup") {
      return;
    }

    this.options.arManager.completeSetup();
    this.setPhase("playing");
  }

  private handleSessionFailed(message: string): void {
    // Falha em qualquer fase manda de volta ao menu com o motivo visivel.
    this.options.startScreen.setMessage(message);
    this.setPhase("menu");
  }

  // Unico lugar que liga/desliga subsistemas. Idempotente: chamar de novo com
  // a mesma fase repete as mesmas chamadas, todas seguras de repetir.
  private setPhase(phase: GamePhase): void {
    this.phase = phase;

    const { arManager, arenaRoot, cardDeckHud, cardDeckSystem, combatEngine, hudLayer, startScreen } = this.options;

    switch (phase) {
      case "menu": {
        if (arManager.isSessionActive()) {
          arManager.exitAR();
        }

        startScreen.show();
        arenaRoot.setEnabled(false);
        cardDeckHud.setVisible(false);
        hudLayer.setStatusVisible(false);
        cardDeckSystem.stopRegeneration();
        combatEngine.setActive(false);
        document.body.classList.remove(LANDSCAPE_BODY_CLASS);
        break;
      }

      case "ar-setup": {
        // Arena fica por conta do ArSessionController: ele que habilita
        // quando o jogador ancorar (ver README.md do spec).
        startScreen.hide();
        cardDeckHud.setVisible(false);
        combatEngine.setActive(false);
        break;
      }

      case "playing": {
        // No modo tela a transicao e menu -> playing direto, sem passar por
        // `ar-setup`: sem este hide o menu fica travado por cima do jogo.
        startScreen.hide();

        // No modo AR quem posicionou a arena foi o ArSessionController;
        // reabilitar aqui e inofensivo mas reposicionar nao e, entao so
        // mexemos em setEnabled fora da RA.
        if (this.mode !== "ar") {
          arenaRoot.setEnabled(true);
        }

        cardDeckHud.setVisible(true);
        hudLayer.setStatusVisible(true);
        cardDeckSystem.startRegeneration();
        combatEngine.setActive(true);
        break;
      }
    }
  }

  private applyCanvasOrientationPolicy(): void {
    document.body.classList.add(LANDSCAPE_BODY_CLASS);
    this.installImmersiveModeGestureOnce();
  }

  private applyArOrientationPolicy(): void {
    // Em RA nao se pede rotacao: as duas orientacoes funcionam, e girar com a
    // sessao no ar estica a cena. Quem cuida de sair da tela cheia/destravar e
    // o proprio enterAR (exitImmersiveMode).
    document.body.classList.remove(LANDSCAPE_BODY_CLASS);
  }

  private installImmersiveModeGestureOnce(): void {
    if (this.hasInstalledImmersiveGesture) {
      return;
    }

    this.hasInstalledImmersiveGesture = true;

    installImmersiveModeOnGesture(this.options.canvas, () => this.options.arManager.isSessionActive());
  }
}
