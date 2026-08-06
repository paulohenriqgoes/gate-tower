import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core/scene";

import { readSafeAreaInsets, type SafeAreaInsets } from "./screenOrientation";

/** Slots fixos da barra superior esquerda, na ordem em que aparecem na tela. */
export type HudTopBarSlot = "mushrooms" | "ar-toggle" | "ar-scale" | "fullscreen";

const SLOT_ORDER: HudTopBarSlot[] = ["mushrooms", "ar-toggle", "ar-scale", "fullscreen"];
const SLOT_WIDTHS: Record<HudTopBarSlot, number> = {
  "ar-scale": 76,
  "ar-toggle": 158,
  fullscreen: 76,
  mushrooms: 92,
};

// Resolucao de referencia do HUD. Todo valor em px dos controles e reescalado
// por `idealWidth/idealHeight`; com `useSmallestIdeal`, em paisagem o fator vem
// da ALTURA — o eixo apertado quando o celular esta deitado.
const IDEAL_WIDTH = 1280;
const IDEAL_HEIGHT = 720;

const TOP_BAR_HEIGHT = 88;
const COLUMN_WIDTH = 560;
const BASE_MARGIN = 22;

/**
 * Camada unica de HUD compartilhada pelo deck de cartas e pelo gerenciador de
 * RA. Antes cada um criava sua propria `AdvancedDynamicTexture` fullscreen, o
 * que impedia posicionar cogumelos, switch de RA e botao de escala na mesma
 * barra sem offsets magicos.
 */
export class HudLayer {
  private readonly texture: AdvancedDynamicTexture;
  private readonly leftColumn: StackPanel;
  private readonly topBar: StackPanel;
  private readonly slots = new Map<HudTopBarSlot, Rectangle>();
  private readonly arStatusText: TextBlock;
  private readonly cardStatusText: TextBlock;
  private safeArea: SafeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };

  public constructor(scene: Scene) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("game-hud", true, scene);
    this.texture.idealWidth = IDEAL_WIDTH;
    this.texture.idealHeight = IDEAL_HEIGHT;
    this.texture.useSmallestIdeal = true;

    this.leftColumn = new StackPanel("hud-left-column");
    this.leftColumn.isVertical = true;
    this.leftColumn.width = `${COLUMN_WIDTH}px`;
    this.leftColumn.spacing = 6;
    this.leftColumn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.leftColumn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.leftColumn.isPointerBlocker = false;
    this.texture.addControl(this.leftColumn);

    this.topBar = new StackPanel("hud-top-bar");
    this.topBar.isVertical = false;
    this.topBar.height = `${TOP_BAR_HEIGHT}px`;
    this.topBar.spacing = 12;
    this.topBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.topBar.isPointerBlocker = false;
    this.leftColumn.addControl(this.topBar);

    for (const slot of SLOT_ORDER) {
      const holder = new Rectangle(`hud-slot-${slot}`);
      holder.width = `${SLOT_WIDTHS[slot]}px`;
      holder.height = `${TOP_BAR_HEIGHT}px`;
      holder.thickness = 0;
      holder.background = "#00000000";
      holder.isPointerBlocker = false;
      this.topBar.addControl(holder);
      this.slots.set(slot, holder);
    }

    this.arStatusText = this.createStatusText("hud-ar-status", 18, "#cbd5e1", 26);
    this.cardStatusText = this.createStatusText("hud-card-status", 15, "#a5b4fc", 46);
    this.cardStatusText.textWrapping = true;

    this.leftColumn.addControl(this.arStatusText);
    this.leftColumn.addControl(this.cardStatusText);

    this.refreshSafeArea();
  }

  public getTexture(): AdvancedDynamicTexture {
    return this.texture;
  }

  /** Insere um controle no slot fixo da barra superior. */
  public fillSlot(slot: HudTopBarSlot, control: Control): void {
    const holder = this.slots.get(slot);

    if (!holder) {
      return;
    }

    holder.clearControls();
    holder.addControl(control);
  }

  /**
   * Some com o slot inteiro (e nao so com o conteudo): o `StackPanel` ignora
   * filhos invisiveis, entao a barra fecha o vao em vez de deixar buraco.
   */
  public setSlotVisible(slot: HudTopBarSlot, isVisible: boolean): void {
    const holder = this.slots.get(slot);

    if (holder) {
      holder.isVisible = isVisible;
    }
  }

  public setArStatus(text: string): void {
    this.arStatusText.text = text;
  }

  public setArStatusVisible(visible: boolean): void {
    this.arStatusText.isVisible = visible;
  }

  public setCardStatus(text: string): void {
    this.cardStatusText.text = text;
  }

  /**
   * Reaplica as margens do HUD considerando o recorte da tela (notch). Em
   * paisagem o inset entra pela esquerda, bem em cima da barra superior.
   * A leitura dos insets mexe no DOM, entao o resultado fica em cache — isso
   * roda a cada `resize`.
   */
  public refreshSafeArea(): void {
    this.safeArea = readSafeAreaInsets();

    const scale = this.cssPixelToIdealPixel();
    this.leftColumn.left = `${BASE_MARGIN + this.safeArea.left * scale}px`;
    this.leftColumn.top = `${BASE_MARGIN + this.safeArea.top * scale}px`;
  }

  /** Margem direita ja compensada pelo notch, em px do espaco ideal. */
  public getRightMargin(): number {
    return BASE_MARGIN + this.safeArea.right * this.cssPixelToIdealPixel();
  }

  public dispose(): void {
    this.texture.dispose();
  }

  /**
   * Converte px CSS para px do espaco ideal do HUD: a textura mede em px de
   * dispositivo e os valores dos controles sao multiplicados por `idealRatio`.
   */
  private cssPixelToIdealPixel(): number {
    const canvas = this.texture.getScene()?.getEngine().getRenderingCanvas();
    const ratio = this.texture.idealRatio;

    if (!canvas || !canvas.clientWidth || !ratio) {
      return 1;
    }

    return this.texture.getSize().width / canvas.clientWidth / ratio;
  }

  private createStatusText(
    name: string,
    fontSize: number,
    color: string,
    height: number
  ): TextBlock {
    const text = new TextBlock(name, "");
    text.width = `${COLUMN_WIDTH}px`;
    text.height = `${height}px`;
    text.color = color;
    text.fontSize = fontSize;
    text.fontFamily = "Trebuchet MS";
    text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.isHitTestVisible = false;

    return text;
  }
}
