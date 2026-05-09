import {
  AdvancedDynamicTexture,
  Control,
  Grid,
  Rectangle,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import type { CardDefinition, CardDeckSnapshot } from "../cards/CardDeckSystem";
import { CardDeckSystem } from "../cards/CardDeckSystem";

interface CardView {
  accent: Rectangle;
  container: Rectangle;
  costBadge: Rectangle;
  costText: TextBlock;
  nameText: TextBlock;
  summaryText: TextBlock;
}

export class CardDeckHud {
  private readonly scene: Scene;
  private readonly deckSystem: CardDeckSystem;
  private readonly ui: AdvancedDynamicTexture;
  private readonly mushroomValueText: TextBlock;
  private readonly mushroomStatusText: TextBlock;
  private readonly mushroomFill: Rectangle;
  private readonly cardViews = new Map<string, CardView>();
  private readonly stateObserver: Observer<CardDeckSnapshot> | null;

  public constructor(scene: Scene, deckSystem: CardDeckSystem) {
    this.scene = scene;
    this.deckSystem = deckSystem;
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI("card-deck-ui", true, this.scene);

    const rootPanel = new StackPanel("card-deck-root");
    rootPanel.isVertical = true;
    rootPanel.width = "94%";
    rootPanel.height = "292px";
    rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    rootPanel.top = "-18px";
    this.ui.addControl(rootPanel);

    const mushroomCounter = new Rectangle("mushroom-counter");
    mushroomCounter.width = "100%";
    mushroomCounter.height = "88px";
    mushroomCounter.cornerRadius = 22;
    mushroomCounter.thickness = 1;
    mushroomCounter.color = "#475569";
    mushroomCounter.background = "#120f1fd9";
    mushroomCounter.isPointerBlocker = true;

    const mushroomStack = new StackPanel("mushroom-stack");
    mushroomStack.isVertical = true;
    mushroomStack.width = "92%";
    mushroomStack.height = "74px";
    mushroomStack.paddingTop = "8px";

    const mushroomTitleText = new TextBlock("mushroom-title", "Cogumelos");
    mushroomTitleText.height = "20px";
    mushroomTitleText.color = "#d8b4fe";
    mushroomTitleText.fontSize = 16;
    mushroomTitleText.fontFamily = "Trebuchet MS";
    mushroomTitleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    this.mushroomValueText = new TextBlock("mushroom-value", "0/10");
    this.mushroomValueText.height = "30px";
    this.mushroomValueText.color = "#f8fafc";
    this.mushroomValueText.fontSize = 28;
    this.mushroomValueText.fontFamily = "Trebuchet MS";
    this.mushroomValueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    this.mushroomStatusText = new TextBlock(
      "mushroom-status",
      "Toque em uma carta para preparar a invocacao."
    );
    this.mushroomStatusText.height = "18px";
    this.mushroomStatusText.color = "#d4d4d8";
    this.mushroomStatusText.fontSize = 12;
    this.mushroomStatusText.fontFamily = "Trebuchet MS";
    this.mushroomStatusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const mushroomBar = new Rectangle("mushroom-bar");
    mushroomBar.width = "100%";
    mushroomBar.height = "8px";
    mushroomBar.cornerRadius = 4;
    mushroomBar.thickness = 0;
    mushroomBar.background = "#312e81";

    this.mushroomFill = new Rectangle("mushroom-fill");
    this.mushroomFill.width = "0%";
    this.mushroomFill.height = "8px";
    this.mushroomFill.cornerRadius = 4;
    this.mushroomFill.thickness = 0;
    this.mushroomFill.background = "#d946ef";
    this.mushroomFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    mushroomBar.addControl(this.mushroomFill);
    mushroomStack.addControl(mushroomTitleText);
    mushroomStack.addControl(this.mushroomValueText);
    mushroomStack.addControl(this.mushroomStatusText);
    mushroomStack.addControl(mushroomBar);
    mushroomCounter.addControl(mushroomStack);
    rootPanel.addControl(mushroomCounter);

    const spacer = new Rectangle("card-deck-spacer");
    spacer.width = "100%";
    spacer.height = "14px";
    spacer.thickness = 0;
    spacer.background = "#00000000";
    rootPanel.addControl(spacer);

    const cardGrid = new Grid("card-deck-grid");
    cardGrid.width = "100%";
    cardGrid.height = "190px";
    cardGrid.isPointerBlocker = true;
    cardGrid.addRowDefinition(1);

    for (let index = 0; index < this.deckSystem.getSnapshot().cards.length; index += 1) {
      cardGrid.addColumnDefinition(1);
    }

    for (const [index, card] of this.deckSystem.getSnapshot().cards.entries()) {
      this.createCardControl(cardGrid, card, index);
    }

    rootPanel.addControl(cardGrid);

    this.stateObserver = this.deckSystem.onStateChangedObservable.add((snapshot) => {
      this.render(snapshot);
    });

    this.render(this.deckSystem.getSnapshot());
  }

  public dispose(): void {
    if (this.stateObserver) {
      this.deckSystem.onStateChangedObservable.remove(this.stateObserver);
    }

    this.ui.dispose();
  }

  private createCardControl(cardGrid: Grid, card: CardDefinition, columnIndex: number): void {
    const container = new Rectangle(`card-${card.id}`);
    container.width = "92%";
    container.height = "178px";
    container.cornerRadius = 22;
    container.thickness = 2;
    container.paddingLeft = "6px";
    container.paddingRight = "6px";
    container.paddingTop = "4px";
    container.paddingBottom = "4px";
    container.isPointerBlocker = true;

    const cardStack = new StackPanel(`card-stack-${card.id}`);
    cardStack.isVertical = true;
    cardStack.width = "86%";
    cardStack.height = "148px";
    cardStack.paddingTop = "14px";

    const accent = new Rectangle(`card-accent-${card.id}`);
    accent.width = "100%";
    accent.height = "10px";
    accent.cornerRadius = 5;
    accent.thickness = 0;
    accent.background = card.accentColor;

    const nameText = new TextBlock(`card-name-${card.id}`, card.name);
    nameText.height = "50px";
    nameText.fontSize = 18;
    nameText.color = "#f8fafc";
    nameText.fontFamily = "Trebuchet MS";
    nameText.textWrapping = true;

    const summaryText = new TextBlock(`card-summary-${card.id}`, card.summary);
    summaryText.height = "44px";
    summaryText.fontSize = 12;
    summaryText.color = "#cbd5e1";
    summaryText.fontFamily = "Trebuchet MS";
    summaryText.textWrapping = true;

    const costBadge = new Rectangle(`card-cost-badge-${card.id}`);
    costBadge.width = "92px";
    costBadge.height = "30px";
    costBadge.cornerRadius = 15;
    costBadge.thickness = 0;
    costBadge.background = card.accentColor;

    const costText = new TextBlock(`card-cost-${card.id}`, `${card.cost} cog.`);
    costText.color = "#ffffff";
    costText.fontSize = 13;
    costText.fontFamily = "Trebuchet MS";

    costBadge.addControl(costText);
    cardStack.addControl(accent);
    cardStack.addControl(nameText);
    cardStack.addControl(summaryText);
    cardStack.addControl(costBadge);
    container.addControl(cardStack);

    container.onPointerClickObservable.add(() => {
      this.deckSystem.selectCard(card.id);
    });

    cardGrid.addControl(container, 0, columnIndex);
    this.cardViews.set(card.id, {
      accent,
      container,
      costBadge,
      costText,
      nameText,
      summaryText,
    });
  }

  private render(snapshot: CardDeckSnapshot): void {
    this.mushroomValueText.text = `${snapshot.mushrooms}/${snapshot.maxMushrooms}`;
    this.mushroomFill.width = `${(snapshot.mushrooms / snapshot.maxMushrooms) * 100}%`;

    const selectedCard = snapshot.selectedCardId
      ? this.deckSystem.getCard(snapshot.selectedCardId)
      : null;

    this.mushroomStatusText.text = selectedCard
      ? `Carta pronta: ${selectedCard.name}`
      : "Toque em uma carta para preparar a invocacao.";

    for (const card of snapshot.cards) {
      const view = this.cardViews.get(card.id);

      if (!view) {
        continue;
      }

      const isAffordable = snapshot.mushrooms >= card.cost;
      const isSelected = snapshot.selectedCardId === card.id;

      view.container.background = isSelected ? this.withAlpha(card.accentColor, "3d") : "#140f1dd9";
      view.container.color = isSelected ? card.accentColor : isAffordable ? "#4c1d95" : "#3f3f46";
      view.container.thickness = isSelected ? 4 : 2;
      view.container.alpha = isAffordable ? 1 : 0.45;

      view.accent.background = isSelected ? "#fdf4ff" : card.accentColor;
      view.costBadge.background = isAffordable ? card.accentColor : "#52525b";
      view.costText.text = `${card.cost} cog.`;
      view.nameText.color = isAffordable ? "#f8fafc" : "#a1a1aa";
      view.summaryText.color = isAffordable ? "#cbd5e1" : "#71717a";
    }
  }

  private withAlpha(hexColor: string, alpha: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
      return `${hexColor}${alpha}`;
    }

    return hexColor;
  }
}
