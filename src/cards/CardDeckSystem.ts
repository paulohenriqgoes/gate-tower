import { Observable } from "@babylonjs/core/Misc/observable";

export interface CardDefinition {
  id: string;
  name: string;
  summary: string;
  cost: number;
  accentColor: string;
}

export interface CardDeckSnapshot {
  cards: CardDefinition[];
  mushrooms: number;
  maxMushrooms: number;
  selectedCardId: string | null;
}

export interface CardDeckSystemOptions {
  cards: CardDefinition[];
  initialMushrooms?: number;
  maxMushrooms?: number;
  regenerationIntervalMs?: number;
}

export class CardDeckSystem {
  public readonly onStateChangedObservable = new Observable<CardDeckSnapshot>();

  private readonly cards: CardDefinition[];
  private readonly maxMushrooms: number;
  private readonly regenerationIntervalMs: number;

  private mushrooms: number;
  private selectedCardId: string | null = null;
  private regenerationHandle: number | null = null;

  public constructor(options: CardDeckSystemOptions) {
    if (!options.cards.length) {
      throw new Error("CardDeckSystem precisa de pelo menos uma carta.");
    }

    this.cards = [...options.cards];
    this.maxMushrooms = options.maxMushrooms ?? 10;
    this.regenerationIntervalMs = options.regenerationIntervalMs ?? 1800;
    this.mushrooms = this.clampMushrooms(options.initialMushrooms ?? 4);
  }

  public startRegeneration(): void {
    if (this.regenerationHandle !== null) {
      return;
    }

    this.regenerationHandle = window.setInterval(() => {
      if (this.mushrooms >= this.maxMushrooms) {
        return;
      }

      this.mushrooms += 1;
      this.emitState();
    }, this.regenerationIntervalMs);

    this.emitState();
  }

  public stopRegeneration(): void {
    if (this.regenerationHandle === null) {
      return;
    }

    window.clearInterval(this.regenerationHandle);
    this.regenerationHandle = null;
  }

  public dispose(): void {
    this.stopRegeneration();
  }

  public getSnapshot(): CardDeckSnapshot {
    return {
      cards: [...this.cards],
      mushrooms: this.mushrooms,
      maxMushrooms: this.maxMushrooms,
      selectedCardId: this.selectedCardId,
    };
  }

  public getCard(cardId: string): CardDefinition | null {
    return this.cards.find((card) => card.id === cardId) ?? null;
  }

  public getSelectedCard(): CardDefinition | null {
    if (!this.selectedCardId) {
      return null;
    }

    return this.getCard(this.selectedCardId);
  }

  public hasEnoughMushroomsFor(cardId: string): boolean {
    const card = this.getCard(cardId);

    if (!card) {
      return false;
    }

    return this.mushrooms >= card.cost;
  }

  public selectCard(cardId: string): boolean {
    const card = this.getCard(cardId);

    if (!card || !this.hasEnoughMushroomsFor(cardId)) {
      return false;
    }

    this.selectedCardId = this.selectedCardId === card.id ? null : card.id;
    this.emitState();

    return true;
  }

  public clearSelection(): void {
    if (!this.selectedCardId) {
      return;
    }

    this.selectedCardId = null;
    this.emitState();
  }

  public tryConsumeSelectedCard(): CardDefinition | null {
    const selectedCard = this.getSelectedCard();

    if (!selectedCard || this.mushrooms < selectedCard.cost) {
      return null;
    }

    this.mushrooms = this.clampMushrooms(this.mushrooms - selectedCard.cost);
    this.selectedCardId = null;
    this.emitState();

    return selectedCard;
  }

  public setMushrooms(value: number): void {
    const nextValue = this.clampMushrooms(value);

    if (nextValue === this.mushrooms) {
      return;
    }

    this.mushrooms = nextValue;

    if (this.selectedCardId && !this.hasEnoughMushroomsFor(this.selectedCardId)) {
      this.selectedCardId = null;
    }

    this.emitState();
  }

  private clampMushrooms(value: number): number {
    return Math.max(0, Math.min(this.maxMushrooms, Math.floor(value)));
  }

  private emitState(): void {
    this.onStateChangedObservable.notifyObservers(this.getSnapshot());
  }
}
