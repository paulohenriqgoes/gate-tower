import { Control, Rectangle, TextBlock } from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core/scene";

import { TOP_ZONE_HEIGHT, type HudLayer } from "./HudLayer";
import { isFullscreen, onOrientationChange } from "./screenOrientation";

const FONT_SIZE = 13;
const PANEL_MARGIN = 12;
const PANEL_PADDING = 8;
const BACKGROUND_COLOR = "#000000b3";
const TEXT_COLOR = "#e2e8f0";

/**
 * Painel de debug em tela: viewport, orientacao e tracking. So existe atras
 * de `?debug=1` porque o celular nao tem console acessivel para conferir
 * esses numeros durante os testes de RA.
 *
 * Fica ancorado no canto superior direito, mas ABAIXO de `TOP_ZONE_HEIGHT`
 * (a faixa de HP/timer do HUD de batalha) para nunca invadir a zona `top` nem
 * a zona `thumb` (terço inferior) do `HudLayer` — o painel de debug e uma
 * ferramenta de teste, nao faz parte do HUD minimo de batalha.
 */
export class DiagnosticsOverlay {
  private readonly scene: Scene;
  private readonly fields = new Map<string, string>();
  private readonly container: Rectangle;
  private readonly textBlock: TextBlock;
  private readonly unsubscribeOrientation: () => void;

  /** true quando a URL tem `?debug=1`. Checar ANTES de instanciar. */
  public static isEnabled(): boolean {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }

  public constructor(hud: HudLayer, scene: Scene) {
    this.scene = scene;

    this.container = new Rectangle("diagnostics-overlay");
    this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.adaptWidthToChildren = true;
    this.container.adaptHeightToChildren = true;
    this.container.thickness = 0;
    this.container.cornerRadius = 6;
    this.container.background = BACKGROUND_COLOR;
    this.container.paddingLeft = `${PANEL_PADDING}px`;
    this.container.paddingRight = `${PANEL_PADDING}px`;
    this.container.paddingTop = `${PANEL_PADDING}px`;
    this.container.paddingBottom = `${PANEL_PADDING}px`;
    this.container.left = `${-PANEL_MARGIN}px`;
    // Comeca logo abaixo da faixa de HP/timer, nunca dentro dela.
    this.container.top = `${TOP_ZONE_HEIGHT + PANEL_MARGIN}px`;
    // Nunca pode roubar toque do jogo: e um painel so-leitura sobre o HUD.
    this.container.isHitTestVisible = false;
    this.container.isPointerBlocker = false;

    this.textBlock = new TextBlock("diagnostics-overlay-text", "");
    this.textBlock.fontFamily = "ui-monospace, monospace";
    this.textBlock.fontSize = FONT_SIZE;
    this.textBlock.color = TEXT_COLOR;
    this.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.textBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.textBlock.textWrapping = false;
    this.textBlock.resizeToFit = true;
    this.textBlock.isHitTestVisible = false;
    this.textBlock.isPointerBlocker = false;
    this.container.addControl(this.textBlock);

    hud.getTexture().addControl(this.container);

    this.unsubscribeOrientation = onOrientationChange(() => this.refreshViewportFields());
    this.refreshViewportFields();
  }

  /** Campo avulso (ex.: "trackingStatus" -> "NORMAL"). Sobrescreve o anterior. */
  public setField(key: string, value: string): void {
    this.fields.set(key, value);
    this.render();
  }

  public setFields(fields: Record<string, string>): void {
    for (const [key, value] of Object.entries(fields)) {
      this.fields.set(key, value);
    }
    this.render();
  }

  /**
   * Recalcula sozinho o que da para ler do DOM/engine. Idempotente — chamada
   * de novo a cada `onOrientationChange` para manter os numeros atuais.
   */
  public refreshViewportFields(): void {
    const engine = this.scene.getEngine();
    const canvas = engine.getRenderingCanvas();
    const orientation = window.screen?.orientation;

    this.setFields({
      orientation: orientation ? `${orientation.type} ${orientation.angle}deg` : "n/a",
      canvasCss: canvas ? `${canvas.clientWidth}x${canvas.clientHeight}` : "n/a",
      canvasPx: canvas ? `${canvas.width}x${canvas.height}` : "n/a",
      render: `${engine.getRenderWidth()}x${engine.getRenderHeight()}`,
      canvasAspect:
        canvas && canvas.clientHeight
          ? (canvas.clientWidth / canvas.clientHeight).toFixed(2)
          : "n/a",
      fullscreen: String(isFullscreen()),
      dpr: String(window.devicePixelRatio),
    });
  }

  public dispose(): void {
    this.unsubscribeOrientation();
    // Container.dispose() descarta os filhos (o TextBlock) e se remove da textura.
    this.container.dispose();
  }

  /** Renderiza `chave: valor` por linha, na ordem de insercao do Map. */
  private render(): void {
    const lines: string[] = [];

    for (const [key, value] of this.fields) {
      lines.push(`${key}: ${value}`);
    }

    this.textBlock.text = lines.join("\n");
  }
}
