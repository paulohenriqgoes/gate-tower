import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core/scene";

import { isPortrait, readSafeAreaInsets, type SafeAreaInsets } from "./screenOrientation";

/** Slots fixos da barra superior esquerda, na ordem em que aparecem na tela. */
export type HudTopBarSlot = "mushrooms" | "ar-scale" | "fullscreen";

const SLOT_ORDER: HudTopBarSlot[] = ["mushrooms", "ar-scale", "fullscreen"];
const SLOT_WIDTHS: Record<HudTopBarSlot, number> = {
  "ar-scale": 76,
  fullscreen: 76,
  mushrooms: 92,
};

// Resolucao de referencia do HUD, sempre com o eixo CURTO da tela valendo
// IDEAL_SHORT. Todo valor em px dos controles e multiplicado por `idealRatio`,
// e com `useSmallestIdeal` o Babylon usa `width/idealWidth` em portrait e
// `height/idealHeight` em paisagem. Manter 1280 na largura nas duas orientacoes
// espremia o design inteiro em ~390 px CSS quando o celular estava em pe —
// tudo ficava ~1.8x menor que em paisagem e os botoes viravam inclicaveis.
const IDEAL_LONG = 1280;
const IDEAL_SHORT = 720;

const AR_STATUS_COLOR = "#cbd5e1";
const AR_STATUS_WARNING_COLOR = "#fca5a5";

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

  // `arStatusText` tem dois donos disputando visibilidade: a fase de jogo
  // (menu vs partida, via `setStatusVisible`) e o posicionamento de RA (via
  // `setArStatusVisible`, chamado pelo EighthWallARManager). O valor exibido
  // e a conjuncao dos dois, senao entrar em RA reacende um status que o menu
  // tinha apagado.
  private isGameFlowStatusVisible = true;
  private isArPlacementStatusVisible = true;

  public constructor(scene: Scene) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("game-hud", true, scene);
    this.texture.useSmallestIdeal = true;
    this.applyIdealResolution();

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

    this.arStatusText = this.createStatusText("hud-ar-status", 18, AR_STATUS_COLOR, 26);
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

  /** Liga/desliga as duas linhas de status (RA e carta selecionada). */
  public setStatusVisible(isVisible: boolean): void {
    this.isGameFlowStatusVisible = isVisible;
    this.arStatusText.isVisible = this.isGameFlowStatusVisible && this.isArPlacementStatusVisible;
    this.cardStatusText.isVisible = isVisible;
  }

  /**
   * O aviso vira cor do texto porque o switch de RA — que antes ficava vermelho
   * em caso de erro — saiu da barra junto com a escolha de modo.
   */
  public setArStatus(text: string, isWarning = false): void {
    this.arStatusText.text = text;
    this.arStatusText.color = isWarning ? AR_STATUS_WARNING_COLOR : AR_STATUS_COLOR;
  }

  public setArStatusVisible(visible: boolean): void {
    this.isArPlacementStatusVisible = visible;
    this.arStatusText.isVisible = this.isGameFlowStatusVisible && this.isArPlacementStatusVisible;
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
    // Antes das margens: elas sao calculadas em px do espaco ideal, que muda
    // junto com a orientacao.
    this.applyIdealResolution();
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
   * Gira o espaco de referencia junto com a tela, para que o eixo curto valha
   * sempre IDEAL_SHORT e um controle de 80px tenha o mesmo tamanho fisico nas
   * duas orientacoes.
   */
  private applyIdealResolution(): void {
    const portrait = isPortrait();

    this.texture.idealWidth = portrait ? IDEAL_SHORT : IDEAL_LONG;
    this.texture.idealHeight = portrait ? IDEAL_LONG : IDEAL_SHORT;
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
