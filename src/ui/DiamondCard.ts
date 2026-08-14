import { Control, Ellipse, Rectangle, TextBlock } from "@babylonjs/gui";

import type { CardDefinition } from "../cards/CardDeckSystem";

// Largura/altura da carta na fileira horizontal. O losango antigo (rotacao de
// 45 graus) fica MUITO ineficiente de largura numa fileira: a diagonal de um
// losango que caiba 4 na tela (~168px de largura util) ocupa ~238px na
// horizontal por causa da rotacao — nao cabe 4 lado a lado na zona `thumb`
// (720px ideais de largura, terço inferior da tela). Por isso a carta virou
// um retangulo arredondado vertical, como a maioria dos jogos de carta
// mobile: mesma leitura de "carta", sem desperdicar largura em diagonal.
// Ver relatorio da Etapa 5 para a justificativa completa.
export const CARD_WIDTH = 148;
export const CARD_HEIGHT = 168;

const COST_BADGE_SIZE = 44;

const BACKGROUND_IDLE = "#140f1dd9";
const BORDER_UNAFFORDABLE = "#3f3f46";

export interface DiamondCardState {
  isAffordable: boolean;
  isSelected: boolean;
}

/**
 * Carta da fileira horizontal do HUD de batalha. O nome e o custo ficam
 * sempre visiveis e sem sobreposicao: o custo mora num selo circular fixo no
 * canto superior direito, fora da area do nome. A descricao (`summary`) NAO
 * aparece aqui — o cartao e pequeno demais para caber texto longo sem
 * truncar; quem quiser o texto completo consulta o catalogo de cartas fora do
 * HUD de batalha (fora do escopo desta etapa).
 */
export class DiamondCard {
  public readonly root: Rectangle;

  private readonly card: CardDefinition;
  private readonly costBadge: Ellipse;
  private readonly nameText: TextBlock;
  private readonly costText: TextBlock;

  public constructor(card: CardDefinition, onSelect: (cardId: string) => void) {
    this.card = card;

    this.root = new Rectangle(`card-${card.id}`);
    this.root.width = `${CARD_WIDTH}px`;
    this.root.height = `${CARD_HEIGHT}px`;
    this.root.cornerRadius = 14;
    this.root.thickness = 3;
    this.root.color = card.accentColor;
    this.root.background = BACKGROUND_IDLE;
    this.root.isPointerBlocker = true;

    this.nameText = new TextBlock(`card-name-${card.id}`, card.name);
    this.nameText.width = "92%";
    this.nameText.height = "84px";
    this.nameText.top = `${COST_BADGE_SIZE - 4}px`;
    // 28 e o piso de legibilidade do projeto (ver `guiUnits.test.ts`), e ele
    // cabe: com `textWrapping` ligado e 92% de 148px disponiveis, a palavra
    // mais larga do catalogo ("Raivoso") ocupa ~102px dos 136px, e duas linhas
    // somam ~67px dos 84px de altura. Nao ha aperto de geometria aqui.
    this.nameText.fontSize = 28;
    this.nameText.color = "#f8fafc";
    this.nameText.fontFamily = "Trebuchet MS";
    this.nameText.textWrapping = true;
    this.nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.nameText.isHitTestVisible = false;

    // Selo de custo: canto superior esquerdo, fora da coluna de texto do
    // nome, entao nunca sobrepoe o titulo mesmo quando ele quebra em 2 linhas.
    this.costBadge = new Ellipse(`card-cost-badge-${card.id}`);
    this.costBadge.width = `${COST_BADGE_SIZE}px`;
    this.costBadge.height = `${COST_BADGE_SIZE}px`;
    this.costBadge.thickness = 2;
    this.costBadge.color = card.accentColor;
    this.costBadge.background = "#0b0713e6";
    this.costBadge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.costBadge.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.costBadge.top = "6px";
    this.costBadge.left = "6px";
    this.costBadge.isHitTestVisible = false;

    this.costText = new TextBlock(`card-cost-${card.id}`, `${card.cost}`);
    this.costText.fontSize = 28;
    this.costText.color = card.accentColor;
    this.costText.fontFamily = "Trebuchet MS";
    this.costText.fontWeight = "bold";
    this.costText.isHitTestVisible = false;
    this.costBadge.addControl(this.costText);

    this.root.addControl(this.nameText);
    this.root.addControl(this.costBadge);

    this.root.onPointerClickObservable.add(() => {
      onSelect(card.id);
    });
  }

  public applyState({ isAffordable, isSelected }: DiamondCardState): void {
    this.root.color = isSelected
      ? "#fdf4ff"
      : isAffordable
        ? this.card.accentColor
        : BORDER_UNAFFORDABLE;
    this.root.thickness = isSelected ? 5 : 3;
    this.root.background = isSelected
      ? this.withAlpha(this.card.accentColor, "3d")
      : BACKGROUND_IDLE;
    this.root.alpha = isAffordable ? 1 : 0.45;

    this.nameText.color = isAffordable ? "#f8fafc" : "#a1a1aa";
    this.costBadge.color = isAffordable ? this.card.accentColor : "#71717a";
    this.costText.color = isAffordable ? this.card.accentColor : "#71717a";
  }

  private withAlpha(hexColor: string, alpha: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
      return `${hexColor}${alpha}`;
    }

    return hexColor;
  }
}
