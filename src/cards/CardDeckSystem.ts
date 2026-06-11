import { Observable } from "@babylonjs/core/Misc/observable";

import { convertMillisecondsToSimulationTicks } from "../battle/SimulationClock";

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
  private readonly regenerationIntervalTicks: number;

  private mushrooms: number;
  private selectedCardId: string | null = null;
  private regenerationEnabled = false;
  private regenerationElapsedTicks = 0;

  public constructor(options: CardDeckSystemOptions) {
    if (!options.cards.length) {
      throw new Error("CardDeckSystem precisa de pelo menos uma carta.");
    }

    this.cards = [...options.cards];
    this.maxMushrooms = options.maxMushrooms ?? 10;
    this.regenerationIntervalTicks = convertMillisecondsToSimulationTicks(
      options.regenerationIntervalMs ?? 1800
    );
    this.mushrooms = this.clampMushrooms(options.initialMushrooms ?? 4);
  }

  public startRegeneration(): void {
    this.regenerationEnabled = true;
    this.emitState();
  }

  public stopRegeneration(): void {
    this.regenerationEnabled = false;
  }

  public dispose(): void {
    this.stopRegeneration();
  }

  public advanceSimulationTick(tickCount = 1): void {
    if (!this.regenerationEnabled || tickCount <= 0) {
      return;
    }

    this.regenerationElapsedTicks += tickCount;
    let didChangeState = false;

    while (this.regenerationElapsedTicks >= this.regenerationIntervalTicks) {
      this.regenerationElapsedTicks -= this.regenerationIntervalTicks;

      if (this.mushrooms >= this.maxMushrooms) {
        continue;
      }

      this.mushrooms += 1;
      didChangeState = true;
    }

    if (didChangeState) {
      this.emitState();
    }
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
    if (!this.selectedCardId) {
      return null;
    }

    return this.tryConsumeCard(this.selectedCardId);
  }

  public tryConsumeCard(cardId: string): CardDefinition | null {
    const card = this.getCard(cardId);

    if (!card || this.mushrooms < card.cost) {
      return null;
    }

    this.mushrooms = this.clampMushrooms(this.mushrooms - card.cost);

    if (this.selectedCardId === card.id) {
      this.selectedCardId = null;
    } else if (this.selectedCardId && !this.hasEnoughMushroomsFor(this.selectedCardId)) {
      this.selectedCardId = null;
    }

    this.emitState();

    return card;
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
