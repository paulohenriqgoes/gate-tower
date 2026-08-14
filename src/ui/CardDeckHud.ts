import { Control, Image, Rectangle, StackPanel } from "@babylonjs/gui";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import type { CardDeckSnapshot } from "../cards/CardDeckSystem";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import { CARD_HEIGHT, DiamondCard } from "./DiamondCard";
import type { HudLayer } from "./HudLayer";

// Tamanho do canvas interno para o widget circular
const RING_CANVAS_SIZE = 128;
// Espessura do arco de progresso
const RING_LINE_WIDTH = 12;
// Lado do quadrado do widget de cogumelos, logo acima da fileira de cartas
const RING_SIZE = 84;
// Espaco horizontal entre as cartas da fileira
const CARD_SPACING = 12;
// Espaco vertical entre o anel de cogumelos e a fileira de cartas
const ROW_SPACING = 10;

/**
 * Pulso do anel de cogumelos quando o jogador toca numa carta que nao pode
 * pagar.
 *
 * Sem isto, `CardDeckSystem.selectCard` recusa em SILENCIO: a carta ja nasce
 * esmaecida (`alpha` 0.45 no `DiamondCard`), mas em cima do feed da camera,
 * num celular, essa diferenca some — e o jogador conclui que a carta esta
 * quebrada. Foi exatamente o relato do device em 2026-08-14 ("as cartas nao
 * funcionavam todas"): o deck comeca com 4 cogumelos e o Cururu custa 5, entao
 * uma das quatro cartas e de fato inclicavel no comeco da partida, por regra.
 *
 * O pulso e no ANEL, nao na carta: a carta nao e o problema, a falta de
 * cogumelo e. Apontar para a causa ensina a economia; sacudir a carta so
 * diria "nao".
 */
const INSUFFICIENT_FLASH_MS = 420;
const INSUFFICIENT_FLASH_SCALE = 0.18;

/**
 * HUD de batalha: widget circular de cogumelos + fileira horizontal de
 * cartas, ambos dentro da zona `thumb` do `HudLayer` (terço inferior, zona do
 * polegar). Os cogumelos ficam IMEDIATAMENTE acima da fileira — nao existe
 * mais barra de status separada para eles.
 */
export class CardDeckHud {
  private readonly scene: Scene;
  private readonly deckSystem: CardDeckSystem;
  private readonly hud: HudLayer;
  private readonly cardViews = new Map<string, DiamondCard>();
  private readonly stateObserver: Observer<CardDeckSnapshot> | null;
  private readonly battleColumn: StackPanel;
  private readonly cardRow: StackPanel;

  // Widget circular do cogumelo
  private readonly ringCanvas: HTMLCanvasElement;
  private readonly ringCtx: CanvasRenderingContext2D;
  private readonly ringImage: Image;
  private readonly ringContainer: Rectangle;
  private isBlinking = false;
  private blinkVisible = true;
  private blinkElapsed = 0;
  // Tempo restante do pulso de "cogumelo insuficiente". Anima ESCALA, nunca
  // alpha — alpha ja tem dono (o blink de anel cheio) e os dois brigariam.
  private insufficientFlashRemainingMs = 0;

  public constructor(scene: Scene, deckSystem: CardDeckSystem, hud: HudLayer) {
    this.scene = scene;
    this.deckSystem = deckSystem;
    this.hud = hud;

    // Coluna vertical unica dentro da zona `thumb`: cogumelos em cima,
    // fileira de cartas embaixo, ambos centralizados.
    this.battleColumn = new StackPanel("battle-hud-column");
    this.battleColumn.isVertical = true;
    this.battleColumn.spacing = ROW_SPACING;
    this.battleColumn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.battleColumn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.battleColumn.isPointerBlocker = false;
    this.hud.zones.thumb.addControl(this.battleColumn);

    // --- Widget circular (topo da coluna de batalha) ---
    this.ringContainer = new Rectangle("mushroom-ring-container");
    this.ringContainer.width = `${RING_SIZE}px`;
    this.ringContainer.height = `${RING_SIZE}px`;
    this.ringContainer.thickness = 0;
    this.ringContainer.background = "#00000000";
    this.ringContainer.isPointerBlocker = false;
    this.ringContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    this.ringCanvas = document.createElement("canvas");
    this.ringCanvas.width = RING_CANVAS_SIZE;
    this.ringCanvas.height = RING_CANVAS_SIZE;
    this.ringCtx = this.ringCanvas.getContext("2d")!;

    this.ringImage = new Image("mushroom-ring-img", "");
    this.ringImage.width = `${RING_SIZE}px`;
    this.ringImage.height = `${RING_SIZE}px`;
    this.ringContainer.addControl(this.ringImage);
    this.battleColumn.addControl(this.ringContainer);

    // --- Fileira horizontal de cartas (base da coluna de batalha) ---
    this.cardRow = new StackPanel("card-deck-row");
    this.cardRow.isVertical = false;
    // NUNCA "auto": o Babylon GUI nao tem essa unidade. O regex de
    // `ValueAndUnit` casa string vazia contra "auto", `parseFloat("")` devolve
    // NaN, e a fileira inteira deixa de renderizar — sem erro, sem aviso, e
    // sem o `tsc` pegar, porque `height` e `string`. Foi o bug que impediu
    // jogar em duas sessoes de device.
    this.cardRow.height = `${CARD_HEIGHT}px`;
    // Encolhe/cresce com o numero real de cartas (3 hoje, 4 numa etapa
    // futura) para o StackPanel centralizar a fileira de verdade: sem
    // `adaptWidthToChildren` a largura ficaria fixa e os filhos se
    // empilhariam a partir da borda esquerda, descentralizando a fileira
    // sempre que houver menos de 4 cartas.
    this.cardRow.adaptWidthToChildren = true;
    this.cardRow.spacing = CARD_SPACING;
    this.cardRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    // A fileira nao bloqueia o ponteiro: quem bloqueia e cada carta. Um toque
    // no vao entre elas ainda chega na arena.
    this.cardRow.isPointerBlocker = false;
    this.battleColumn.addControl(this.cardRow);

    for (const card of this.deckSystem.getSnapshot().cards) {
      const view = new DiamondCard(card, (cardId) => {
        // `selectCard` devolve false quando faltam cogumelos. Antes esse
        // `false` era descartado e a recusa nao chegava ao jogador de forma
        // nenhuma — ver `INSUFFICIENT_FLASH_MS`.
        if (!this.deckSystem.selectCard(cardId)) {
          this.insufficientFlashRemainingMs = INSUFFICIENT_FLASH_MS;
        }
      });

      this.cardRow.addControl(view.root);
      this.cardViews.set(card.id, view);
    }

    // Observer de estado
    this.stateObserver = this.deckSystem.onStateChangedObservable.add((snapshot) => {
      this.render(snapshot);
    });

    // Animação de blink via registerBeforeRender
    this.scene.registerBeforeRender(() => {
      const deltaMs = this.scene.getEngine().getDeltaTime();

      this.updateInsufficientFlash(deltaMs);

      if (!this.isBlinking) {
        return;
      }
      this.blinkElapsed += deltaMs;
      if (this.blinkElapsed >= 400) {
        this.blinkElapsed = 0;
        this.blinkVisible = !this.blinkVisible;
        this.ringContainer.alpha = this.blinkVisible ? 1 : 0.4;
      }
    });

    this.render(this.deckSystem.getSnapshot());
  }

  /**
   * Liga/desliga o HUD de batalha inteiro (cogumelos + cartas + timer + HP):
   * delega para `HudLayer.setBattleHudVisible`, que e quem sabe sobre as duas
   * zonas de retrato. O `GameFlow` (fora do escopo desta etapa) so conhece
   * este metodo, entao ele continua sendo o unico gatilho de visibilidade da
   * partida.
   */
  public setVisible(isVisible: boolean): void {
    this.hud.setBattleHudVisible(isVisible);

    if (isVisible) {
      // O blink pode ter deixado o alpha em 0.4 no instante em que sumiu.
      this.ringContainer.alpha = 1;
    }
  }

  public dispose(): void {
    if (this.stateObserver) {
      this.deckSystem.onStateChangedObservable.remove(this.stateObserver);
    }

    this.battleColumn.dispose();
  }

  /**
   * Meia onda de seno na escala do anel: cresce e volta, sem degrau nem
   * estado residual. Quando o tempo acaba a escala e forcada de volta a 1,
   * porque a curva so chega perto de 1 — deixar 0,999 acumularia deriva a
   * cada toque recusado.
   */
  private updateInsufficientFlash(deltaMs: number): void {
    if (this.insufficientFlashRemainingMs <= 0) {
      return;
    }

    this.insufficientFlashRemainingMs -= deltaMs;

    if (this.insufficientFlashRemainingMs <= 0) {
      this.insufficientFlashRemainingMs = 0;
      this.ringContainer.scaleX = 1;
      this.ringContainer.scaleY = 1;
      return;
    }

    const progress = 1 - this.insufficientFlashRemainingMs / INSUFFICIENT_FLASH_MS;
    const scale = 1 + INSUFFICIENT_FLASH_SCALE * Math.sin(progress * Math.PI);

    this.ringContainer.scaleX = scale;
    this.ringContainer.scaleY = scale;
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
