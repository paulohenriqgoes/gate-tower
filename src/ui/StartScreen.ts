import { Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { Observable } from "@babylonjs/core/Misc/observable";

import type { GameMode } from "../game/GameTypes";
import type { HudLayer } from "./HudLayer";

const OVERLAY_BACKGROUND = "#090e13e6";
const PANEL_WIDTH = "88%";
const BUTTON_HEIGHT = 76;
const AR_BUTTON_BACKGROUND = "#216e39";
const CANVAS_BUTTON_BACKGROUND = "#1f3a4d";
const AR_BUTTON_DISABLED_ALPHA = 0.35;
const MESSAGE_COLOR = "#fca5a5";
const SUBTITLE_COLOR = "#cbd5e1";

/**
 * Tela inicial que cobre a cena e deixa o jogador escolher o modo antes da
 * partida comecar. Nao conhece RA nem regras de jogo — so notifica a escolha,
 * quem reage e o `GameFlow`.
 */
export class StartScreen {
  public readonly onModeSelectedObservable = new Observable<GameMode>();

  private readonly root: Rectangle;
  private readonly arButton: Button;
  private readonly messageText: TextBlock;

  private isArAvailable = false;

  public constructor(hud: HudLayer) {
    this.root = new Rectangle("start-screen-root");
    this.root.width = "100%";
    this.root.height = "100%";
    this.root.thickness = 0;
    this.root.background = OVERLAY_BACKGROUND;
    // Bloqueia o ponteiro enquanto o menu esta aberto: nenhum toque vaza para
    // a arena atras dele.
    this.root.isPointerBlocker = true;
    this.root.isVisible = false;

    const panel = new StackPanel("start-screen-panel");
    panel.isVertical = true;
    panel.width = PANEL_WIDTH;
    panel.spacing = 20;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

    const title = new TextBlock("start-screen-title", "Tower Gate");
    title.width = "100%";
    title.height = "64px";
    title.color = "white";
    title.fontSize = 44;
    title.fontFamily = "Trebuchet MS";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    const subtitle = new TextBlock(
      "start-screen-subtitle",
      "Escolha como jogar: com a camera do celular em Realidade Aumentada ou direto na tela."
    );
    subtitle.width = "100%";
    subtitle.height = "72px";
    subtitle.color = SUBTITLE_COLOR;
    subtitle.fontSize = 28;
    subtitle.fontFamily = "Trebuchet MS";
    subtitle.textWrapping = true;
    subtitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    this.arButton = Button.CreateSimpleButton("start-screen-ar-btn", "Jogar em RA");
    this.styleButton(this.arButton, AR_BUTTON_BACKGROUND);
    // Comeca indisponivel: o engine do 8th Wall carrega de forma assincrona e
    // so libera quando `setArAvailable(true)` for chamado.
    this.arButton.alpha = AR_BUTTON_DISABLED_ALPHA;

    const canvasButton = Button.CreateSimpleButton("start-screen-canvas-btn", "Jogar na tela");
    this.styleButton(canvasButton, CANVAS_BUTTON_BACKGROUND);

    this.messageText = new TextBlock("start-screen-message", "");
    this.messageText.width = "100%";
    this.messageText.height = "48px";
    this.messageText.color = MESSAGE_COLOR;
    this.messageText.fontSize = 32;
    this.messageText.fontFamily = "Trebuchet MS";
    this.messageText.textWrapping = true;
    this.messageText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.messageText.isVisible = false;

    panel.addControl(title);
    panel.addControl(subtitle);
    panel.addControl(this.arButton);
    panel.addControl(canvasButton);
    panel.addControl(this.messageText);

    this.root.addControl(panel);
    hud.getTexture().addControl(this.root);

    this.arButton.onPointerClickObservable.add(() => {
      // Guard no handler em vez de remover o observer: o botao volta a
      // funcionar assim que `setArAvailable(true)` for chamado, sem religar
      // nada.
      if (!this.isArAvailable) {
        return;
      }

      this.onModeSelectedObservable.notifyObservers("ar");
    });

    canvasButton.onPointerClickObservable.add(() => {
      this.onModeSelectedObservable.notifyObservers("canvas");
    });
  }

  public show(): void {
    this.root.isVisible = true;
  }

  public hide(): void {
    this.root.isVisible = false;
  }

  /** Esmaece e inerta o botao de RA quando o device/engine nao suporta. */
  public setArAvailable(isAvailable: boolean): void {
    this.isArAvailable = isAvailable;
    this.arButton.alpha = isAvailable ? 1 : AR_BUTTON_DISABLED_ALPHA;
  }

  /** Linha de aviso sob os botoes (ex.: "Permissao de camera negada"). */
  public setMessage(message: string): void {
    this.messageText.text = message;
    this.messageText.isVisible = message.length > 0;
  }

  public dispose(): void {
    this.root.dispose();
    this.onModeSelectedObservable.clear();
  }

  /** Estilo compartilhado dos dois botoes: mesma altura, fonte e cantos. */
  private styleButton(button: Button, background: string): void {
    button.width = "100%";
    button.height = `${BUTTON_HEIGHT}px`;
    button.color = "white";
    button.fontSize = 30;
    button.fontFamily = "Trebuchet MS";
    button.cornerRadius = 16;
    button.thickness = 0;
    button.background = background;
  }
}
