import { Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

import type { CardDefinition } from "../cards/CardDeckSystem";

/** Lado do quadrado que, rotacionado, vira o losango. */
export const DIAMOND_SIDE = 136;
/** Altura/largura ocupada de fato na tela pelo losango. */
export const DIAMOND_DIAGONAL = Math.round(DIAMOND_SIDE * Math.SQRT2);

// Conteudo inscrito no losango: para caber, metade da largura mais metade da
// altura precisa ficar dentro da "meia-diagonal" (DIAMOND_DIAGONAL / 2).
const CONTENT_WIDTH = 124;
const CONTENT_HEIGHT = 64;

const BACKGROUND_IDLE = "#140f1dd9";
const BORDER_UNAFFORDABLE = "#3f3f46";

export interface DiamondCardState {
  isAffordable: boolean;
  isSelected: boolean;
}

/**
 * Carta em formato de losango para a coluna lateral do HUD.
 *
 * O `StackPanel` empilha pela altura medida ANTES da rotacao, entao um controle
 * girado se sobreporia ao vizinho. Por isso o losango vive dentro de um wrapper
 * sem rotacao cuja altura ja e a diagonal — e o wrapper que o painel mede.
 * O conteudo e contra-rotacionado em -45 graus para o texto ficar na horizontal
 * (a rotacao do pai e herdada pelos filhos).
 */
export class DiamondCard {
  public readonly root: Rectangle;

  private readonly card: CardDefinition;
  private readonly diamond: Rectangle;
  private readonly nameText: TextBlock;
  private readonly costText: TextBlock;

  public constructor(card: CardDefinition, onSelect: (cardId: string) => void) {
    this.card = card;

    this.root = new Rectangle(`card-wrapper-${card.id}`);
    this.root.width = `${DIAMOND_DIAGONAL}px`;
    this.root.height = `${DIAMOND_DIAGONAL}px`;
    this.root.thickness = 0;
    this.root.background = "#00000000";
    this.root.isPointerBlocker = false;

    this.diamond = new Rectangle(`card-${card.id}`);
    this.diamond.width = `${DIAMOND_SIDE}px`;
    this.diamond.height = `${DIAMOND_SIDE}px`;
    this.diamond.rotation = Math.PI / 4;
    this.diamond.cornerRadius = 16;
    this.diamond.thickness = 3;
    this.diamond.color = card.accentColor;
    this.diamond.background = BACKGROUND_IDLE;
    this.diamond.isPointerBlocker = true;

    const content = new StackPanel(`card-content-${card.id}`);
    content.isVertical = true;
    content.rotation = -Math.PI / 4;
    content.width = `${CONTENT_WIDTH}px`;
    content.height = `${CONTENT_HEIGHT}px`;
    content.isPointerBlocker = false;

    this.nameText = new TextBlock(`card-name-${card.id}`, card.name);
    this.nameText.width = `${CONTENT_WIDTH}px`;
    this.nameText.height = "38px";
    this.nameText.fontSize = 15;
    this.nameText.color = "#f8fafc";
    this.nameText.fontFamily = "Trebuchet MS";
    this.nameText.textWrapping = true;
    this.nameText.isHitTestVisible = false;

    this.costText = new TextBlock(`card-cost-${card.id}`, `${card.cost} \u{1F344}`);
    this.costText.width = `${CONTENT_WIDTH}px`;
    this.costText.height = "24px";
    this.costText.fontSize = 16;
    this.costText.color = card.accentColor;
    this.costText.fontFamily = "Trebuchet MS";
    this.costText.isHitTestVisible = false;

    content.addControl(this.nameText);
    content.addControl(this.costText);
    this.diamond.addControl(content);
    this.root.addControl(this.diamond);

    // O hit-test do Babylon GUI aplica a matriz inversa do controle, entao o
    // clique respeita o losango e nao a caixa quadrada em volta dele.
    this.diamond.onPointerClickObservable.add(() => {
      onSelect(card.id);
    });
  }

  public applyState({ isAffordable, isSelected }: DiamondCardState): void {
    this.diamond.color = isSelected
      ? "#fdf4ff"
      : isAffordable
        ? this.card.accentColor
        : BORDER_UNAFFORDABLE;
    this.diamond.thickness = isSelected ? 6 : 3;
    this.diamond.background = isSelected
      ? this.withAlpha(this.card.accentColor, "3d")
      : BACKGROUND_IDLE;
    this.root.alpha = isAffordable ? 1 : 0.45;

    this.nameText.color = isAffordable ? "#f8fafc" : "#a1a1aa";
    this.costText.color = isAffordable ? this.card.accentColor : "#71717a";
  }

  private withAlpha(hexColor: string, alpha: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
      return `${hexColor}${alpha}`;
    }

    return hexColor;
  }
}
