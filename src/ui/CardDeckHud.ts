import {
  AdvancedDynamicTexture,
  Control,
  Grid,
  Image,
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

// Tamanho do canvas interno para o widget circular
const RING_CANVAS_SIZE = 128;
// Espessura do arco de progresso
const RING_LINE_WIDTH = 12;

export class CardDeckHud {
  private readonly scene: Scene;
  private readonly deckSystem: CardDeckSystem;
  private readonly ui: AdvancedDynamicTexture;
  private readonly mushroomStatusText: TextBlock;
  private readonly cardViews = new Map<string, CardView>();
  private readonly stateObserver: Observer<CardDeckSnapshot> | null;

  // Widget circular do cogumelo
  private readonly ringCanvas: HTMLCanvasElement;
  private readonly ringCtx: CanvasRenderingContext2D;
  private readonly ringImage: Image;
  private readonly ringContainer: Rectangle;
  private isBlinking = false;
  private blinkVisible = true;
  private blinkElapsed = 0;

  public constructor(scene: Scene, deckSystem: CardDeckSystem) {
    this.scene = scene;
    this.deckSystem = deckSystem;
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI("card-deck-ui", true, this.scene);

    // --- Widget circular (canto superior esquerdo) ---
    this.ringContainer = new Rectangle("mushroom-ring-container");
    this.ringContainer.width = "80px";
    this.ringContainer.height = "80px";
    this.ringContainer.thickness = 0;
    this.ringContainer.background = "#00000000";
    this.ringContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.ringContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.ringContainer.top = "20px";
    this.ringContainer.left = "20px";
    this.ringContainer.isPointerBlocker = false;

    this.ringCanvas = document.createElement("canvas");
    this.ringCanvas.width = RING_CANVAS_SIZE;
    this.ringCanvas.height = RING_CANVAS_SIZE;
    this.ringCtx = this.ringCanvas.getContext("2d")!;

    this.ringImage = new Image("mushroom-ring-img", "");
    this.ringImage.width = "80px";
    this.ringImage.height = "80px";
    this.ringContainer.addControl(this.ringImage);
    this.ui.addControl(this.ringContainer);

    // --- Painel inferior (cartas + status) ---
    const rootPanel = new StackPanel("card-deck-root");
    rootPanel.isVertical = true;
    rootPanel.width = "94%";
    rootPanel.height = "222px";
    rootPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    rootPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    rootPanel.top = "-18px";
    this.ui.addControl(rootPanel);

    this.mushroomStatusText = new TextBlock(
      "mushroom-status",
      "Toque em uma carta para preparar a invocacao."
    );
    this.mushroomStatusText.height = "18px";
    this.mushroomStatusText.color = "#d4d4d8";
    this.mushroomStatusText.fontSize = 12;
    this.mushroomStatusText.fontFamily = "Trebuchet MS";
    this.mushroomStatusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    rootPanel.addControl(this.mushroomStatusText);

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

    // Observer de estado
    this.stateObserver = this.deckSystem.onStateChangedObservable.add((snapshot) => {
      this.render(snapshot);
    });

    // Animação de blink via registerBeforeRender
    this.scene.registerBeforeRender(() => {
      if (!this.isBlinking) {
        return;
      }
      this.blinkElapsed += this.scene.getEngine().getDeltaTime();
      if (this.blinkElapsed >= 400) {
        this.blinkElapsed = 0;
        this.blinkVisible = !this.blinkVisible;
        this.ringContainer.alpha = this.blinkVisible ? 1 : 0.4;
      }
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
    // Desenhar widget circular
    this.drawRing(snapshot.mushrooms, snapshot.maxMushrooms);

    // Controlar blink quando cheio
    const isFull = snapshot.mushrooms >= snapshot.maxMushrooms;
    if (isFull && !this.isBlinking) {
      this.isBlinking = true;
      this.blinkElapsed = 0;
      this.blinkVisible = true;
    } else if (!isFull && this.isBlinking) {
      this.isBlinking = false;
      this.ringContainer.alpha = 1;
    }

    // Texto de status
    const selectedCard = snapshot.selectedCardId
      ? this.deckSystem.getCard(snapshot.selectedCardId)
      : null;

    this.mushroomStatusText.text = selectedCard
      ? `Carta pronta: ${selectedCard.name}`
      : "Toque em uma carta para preparar a invocacao.";

    // Atualizar cartas
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

  /** Desenha o arco circular psicodélico com cogumelo no centro */
  private drawRing(current: number, max: number): void {
    const ctx = this.ringCtx;
    const size = RING_CANVAS_SIZE;
    const center = size / 2;
    const radius = center - RING_LINE_WIDTH;

    ctx.clearRect(0, 0, size, size);

    // Track de fundo (indigo escuro)
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.lineWidth = RING_LINE_WIDTH;
    ctx.strokeStyle = "#1e1b4b";
    ctx.stroke();

    // Arco de progresso com gradiente psicodélico
    const progress = Math.min(current / max, 1);
    if (progress > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + progress * Math.PI * 2;

      // Gradiente cônico (magenta → cyan → amarelo → magenta)
      const gradient = ctx.createConicGradient(startAngle, center, center);
      gradient.addColorStop(0, "#ff00ff");
      gradient.addColorStop(0.33, "#00ffff");
      gradient.addColorStop(0.66, "#ffff00");
      gradient.addColorStop(1, "#ff00ff");

      ctx.beginPath();
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.lineWidth = RING_LINE_WIDTH;
      ctx.lineCap = "round";
      ctx.strokeStyle = gradient;
      ctx.stroke();
    }

    // Fundo circular interno (semi-transparente)
    ctx.beginPath();
    ctx.arc(center, center, radius - RING_LINE_WIDTH, 0, Math.PI * 2);
    ctx.fillStyle = "#120f1fcc";
    ctx.fill();

    // Cogumelo emoji centralizado
    ctx.font = "32px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("\u{1F344}", center, center - 4);

    // Texto numérico (current/max)
    ctx.font = "bold 16px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#d8b4fe";
    ctx.fillText(`${current}/${max}`, center, center + 18);

    // Atualizar Image source com data URL do canvas
    this.ringImage.source = this.ringCanvas.toDataURL();
  }

  private withAlpha(hexColor: string, alpha: string): string {
    if (/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
      return `${hexColor}${alpha}`;
    }

    return hexColor;
  }
}
