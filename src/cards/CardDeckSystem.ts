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
  private readonly initialMushrooms: number;
  private readonly maxMushrooms: number;
  private readonly regenerationIntervalMs: number;

  private mushrooms: number;
  private selectedCardId: string | null = null;
  private regenerationHandle: number | null = null;
  // Multiplicador da taxa de regeneracao (Etapa 7: cogumelo em dobro no
  // ultimo minuto). 2 = intervalo pela metade. Volta a 1 sozinho quando a
  // regeneracao para (ver `stopRegeneration`) — nao precisa de quem chamou
  // `setRegenerationMultiplier` lembrar de resetar ao sair da partida.
  private regenerationMultiplier = 1;

  public constructor(options: CardDeckSystemOptions) {
    if (!options.cards.length) {
      throw new Error("CardDeckSystem precisa de pelo menos uma carta.");
    }

    this.cards = [...options.cards];
    this.maxMushrooms = options.maxMushrooms ?? 10;
    this.regenerationIntervalMs = options.regenerationIntervalMs ?? 1800;
    this.initialMushrooms = this.clampMushrooms(options.initialMushrooms ?? 4);
    this.mushrooms = this.initialMushrooms;
  }

  public startRegeneration(): void {
    if (this.regenerationHandle !== null) {
      return;
    }

    this.regenerationHandle = window.setInterval(() => {
      this.regenerateOneMushroom();
    }, this.getEffectiveRegenerationIntervalMs());

    this.emitState();
  }

  public stopRegeneration(): void {
    // Fim da partida (ou volta ao menu/mundo vivo) sempre volta a taxa
    // normal — ninguem que desliga a regeneracao precisa lembrar de tambem
    // chamar `setRegenerationMultiplier(1)` a parte.
    this.regenerationMultiplier = 1;

    if (this.regenerationHandle === null) {
      return;
    }

    window.clearInterval(this.regenerationHandle);
    this.regenerationHandle = null;
  }

  /**
   * Multiplicador da taxa de regeneracao. 2 = um cogumelo a cada metade do
   * intervalo normal (a economia do ultimo minuto, ligada por quem monta a
   * partida a `MatchClock.onFinalMinuteObservable`).
   *
   * REPROGRAMA o timer em vez de deixar o ciclo em voo terminar com o
   * intervalo antigo: se o timer atual foi armado com 1800ms e o multiplicador
   * dobra aos 1200ms desse ciclo, esperar o `setInterval` original disparar
   * significaria usar o intervalo ANTIGO por mais um ciclo inteiro depois da
   * troca — exatamente o que a spec pede para evitar. A troca cancela o
   * `setInterval` corrente e arma um novo do zero com o intervalo novo,
   * descartando o progresso do ciclo em curso (o pior caso e um cogumelo
   * chegar um pouco mais tarde do que chegaria se o progresso fosse
   * preservado — aceitavel: preservar exigiria guardar o instante do ultimo
   * tick e calcular o residuo, complexidade que este acerto de taxa nao
   * justifica).
   */
  public setRegenerationMultiplier(multiplier: number): void {
    if (multiplier <= 0) {
      throw new Error("Multiplicador de regeneracao precisa ser positivo.");
    }

    if (this.regenerationMultiplier === multiplier) {
      return;
    }

    this.regenerationMultiplier = multiplier;

    if (this.regenerationHandle === null) {
      return;
    }

    window.clearInterval(this.regenerationHandle);
    this.regenerationHandle = window.setInterval(() => {
      this.regenerateOneMushroom();
    }, this.getEffectiveRegenerationIntervalMs());
  }

  public dispose(): void {
    this.stopRegeneration();
  }

  /**
   * Volta ao estado de inicio de partida (Etapa 8 — "os cogumelos voltam ao
   * valor inicial?"): cogumelos no valor de construcao, nenhuma carta
   * selecionada, multiplicador de regeneracao normal. NAO liga/desliga o
   * timer de regeneracao — isso continua por conta de quem chama
   * (`GameFlow`, via `startRegeneration`/`stopRegeneration`).
   */
  public reset(): void {
    this.mushrooms = this.initialMushrooms;
    this.selectedCardId = null;
    this.regenerationMultiplier = 1;
    this.emitState();
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

  /**
   * Gasta `amount` cogumelos SEM carta nenhuma envolvida. Devolve `false` — e
   * nao gasta nada — quando o estoque nao cobre.
   *
   * Existe para a fireball (JG-12): ela custa 1 cogumelo e nao ocupa slot de
   * carta, entao `tryConsumeSelectedCard` nao serve. E de proposito que ela
   * disputa o MESMO estoque das cartas: cada tiro e uma carta que o jogador
   * nao jogou, e e essa a unica coisa que segura a magia de virar a estrategia
   * principal — ela nao tem cooldown.
   *
   * NAO mexe na selecao de carta: atirar no meio de uma escolha nao desfaz a
   * escolha. Se o gasto deixar o estoque abaixo do custo da carta selecionada,
   * quem trata e o `emitState` + a checagem de `tryConsumeSelectedCard`, igual
   * a quando o cogumelo e gasto de qualquer outro jeito.
   */
  public tryConsumeMushrooms(amount: number): boolean {
    if (amount < 0 || this.mushrooms < amount) {
      return false;
    }

    this.mushrooms = this.clampMushrooms(this.mushrooms - amount);
    this.emitState();

    return true;
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

  private regenerateOneMushroom(): void {
    if (this.mushrooms >= this.maxMushrooms) {
      return;
    }

    this.mushrooms += 1;
    this.emitState();
  }

  private getEffectiveRegenerationIntervalMs(): number {
    return this.regenerationIntervalMs / this.regenerationMultiplier;
  }

  private clampMushrooms(value: number): number {
    return Math.max(0, Math.min(this.maxMushrooms, Math.floor(value)));
  }

  private emitState(): void {
    this.onStateChangedObservable.notifyObservers(this.getSnapshot());
  }
}
