import { Control, Image, Rectangle, StackPanel } from "@babylonjs/gui";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import type { CardDeckSnapshot } from "../cards/CardDeckSystem";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import { DiamondCard, DIAMOND_DIAGONAL } from "./DiamondCard";
import type { HudLayer } from "./HudLayer";

// Tamanho do canvas interno para o widget circular
const RING_CANVAS_SIZE = 128;
// Espessura do arco de progresso
const RING_LINE_WIDTH = 12;
// Lado do quadrado do widget de cogumelos dentro da barra superior
const RING_SIZE = 84;
// Espaco vertical entre os losangos da coluna lateral
const CARD_SPACING = 10;

const IDLE_STATUS = "Toque em uma carta para preparar a invocacao.";

export class CardDeckHud {
  private readonly scene: Scene;
  private readonly deckSystem: CardDeckSystem;
  private readonly hud: HudLayer;
  private readonly cardViews = new Map<string, DiamondCard>();
  private readonly stateObserver: Observer<CardDeckSnapshot> | null;
  private readonly cardColumn: StackPanel;

  // Widget circular do cogumelo
  private readonly ringCanvas: HTMLCanvasElement;
  private readonly ringCtx: CanvasRenderingContext2D;
  private readonly ringImage: Image;
  private readonly ringContainer: Rectangle;
  private isBlinking = false;
  private blinkVisible = true;
  private blinkElapsed = 0;

  public constructor(scene: Scene, deckSystem: CardDeckSystem, hud: HudLayer) {
    this.scene = scene;
    this.deckSystem = deckSystem;
    this.hud = hud;

    // --- Widget circular (slot esquerdo da barra superior) ---
    this.ringContainer = new Rectangle("mushroom-ring-container");
    this.ringContainer.width = `${RING_SIZE}px`;
    this.ringContainer.height = `${RING_SIZE}px`;
    this.ringContainer.thickness = 0;
    this.ringContainer.background = "#00000000";
    this.ringContainer.isPointerBlocker = false;

    this.ringCanvas = document.createElement("canvas");
    this.ringCanvas.width = RING_CANVAS_SIZE;
    this.ringCanvas.height = RING_CANVAS_SIZE;
    this.ringCtx = this.ringCanvas.getContext("2d")!;

    this.ringImage = new Image("mushroom-ring-img", "");
    this.ringImage.width = `${RING_SIZE}px`;
    this.ringImage.height = `${RING_SIZE}px`;
    this.ringContainer.addControl(this.ringImage);
    this.hud.fillSlot("mushrooms", this.ringContainer);

    // --- Coluna de cartas (borda direita, em paisagem) ---
    this.cardColumn = new StackPanel("card-deck-column");
    this.cardColumn.isVertical = true;
    this.cardColumn.width = `${DIAMOND_DIAGONAL}px`;
    this.cardColumn.spacing = CARD_SPACING;
    this.cardColumn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.cardColumn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    // A coluna nao bloqueia o ponteiro: quem bloqueia e cada losango, cujo
    // `contains` aplica a matriz inversa e respeita a forma girada. Assim um
    // toque no vao entre as cartas ainda chega na arena.
    this.cardColumn.isPointerBlocker = false;
    this.hud.getTexture().addControl(this.cardColumn);
    this.applyColumnMargin();

    for (const card of this.deckSystem.getSnapshot().cards) {
      const view = new DiamondCard(card, (cardId) => {
        this.deckSystem.selectCard(cardId);
      });

      this.cardColumn.addControl(view.root);
      this.cardViews.set(card.id, view);
    }

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

  /** Esconde coluna de cartas e anel de cogumelos fora da partida. */
  public setVisible(isVisible: boolean): void {
    this.cardColumn.isVisible = isVisible;
    this.ringContainer.isVisible = isVisible;

    if (isVisible) {
      // O blink pode ter deixado o alpha em 0.4 no instante em que sumiu.
      this.ringContainer.alpha = 1;
    }
  }

  /** Reposiciona a coluna apos mudanca de orientacao/tamanho (notch inclusive). */
  public applyColumnMargin(): void {
    this.cardColumn.left = `${-this.hud.getRightMargin()}px`;
  }

  public dispose(): void {
    if (this.stateObserver) {
      this.deckSystem.onStateChangedObservable.remove(this.stateObserver);
    }

    this.cardColumn.dispose();
    this.ringContainer.dispose();
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

    // Com o losango nao ha espaco para a descricao: ela vira o texto de status.
    const selectedCard = snapshot.selectedCardId
      ? this.deckSystem.getCard(snapshot.selectedCardId)
      : null;

    this.hud.setCardStatus(
      selectedCard ? `${selectedCard.name}: ${selectedCard.summary}` : IDLE_STATUS
    );

    // Atualizar cartas
    for (const card of snapshot.cards) {
      const view = this.cardViews.get(card.id);

      if (!view) {
        continue;
      }

      view.applyState({
        isAffordable: snapshot.mushrooms >= card.cost,
        isSelected: snapshot.selectedCardId === card.id,
      });
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
}
