# Arquitetura — Estados, Cenas e Ciclo de Vida

Babylon.js não impõe uma arquitetura de jogo — ele só te dá `Engine`, `Scene` e um render loop. Isso é ótimo para prototipagem, mas significa que a estrutura de states/entities precisa ser decidida pelo desenvolvedor. Os padrões abaixo evitam os dois erros mais comuns: (1) toda a lógica do jogo dentro do `main.ts`/callback do render loop, e (2) trocar de "fase" do jogo sem liberar o que a fase anterior alocou.

## A classe `Game` (raiz)

Uma única classe dona do `Engine` e do render loop, delegando tudo mais para o estado atual:

```ts
import { Engine } from "@babylonjs/core/Engines/engine";
import { StateManager } from "./StateManager";

export class Game {
  public readonly engine: Engine;
  public readonly canvas: HTMLCanvasElement;
  public readonly states: StateManager;

  constructor(engine: Engine, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
    this.states = new StateManager(this);
  }

  public start(): void {
    this.engine.runRenderLoop(() => {
      this.states.current?.update(this.engine.getDeltaTime());
      this.states.current?.scene.render();
    });
  }
}
```

Note que `update()` recebe o delta time do frame (`engine.getDeltaTime()`, em milissegundos) — qualquer movimento ou timer de gameplay deve ser multiplicado por esse delta, nunca assumir 60 fps fixos. Isso é o que mantém o jogo com a mesma velocidade em qualquer taxa de quadros (30, 60, 144).

## Máquina de estados do jogo

Um jogo tem fases claramente distintas — menu, loading, gameplay, pause, game over — e cada uma tem sua própria `Scene`, seus próprios listeners de input, e seus próprios recursos para liberar ao sair. Modelar isso como uma máquina de estados evita que lógica de menu e lógica de gameplay se misturem no mesmo arquivo.

```ts
import { Scene } from "@babylonjs/core/scene";
import type { Game } from "./Game";

export abstract class GameState {
  public readonly scene: Scene;

  constructor(protected game: Game) {
    this.scene = new Scene(game.engine);
  }

  abstract enter(): Promise<void> | void;
  abstract update(deltaTime: number): void;

  exit(): void {
    // Ponto único e óbvio para liberar tudo que este estado alocou.
    this.scene.dispose();
  }
}

export class StateManager {
  public current: GameState | null = null;

  constructor(private game: Game) {}

  async change<T extends GameState>(StateClass: new (game: Game) => T): Promise<void> {
    this.current?.exit();
    this.current = new StateClass(this.game);
    await this.current.enter();
  }
}
```

Cada estado concreto (`MenuState`, `GameplayState`, `PauseState`...) implementa `enter()` (monta câmera, luzes, carrega assets, registra input) e `update()` (lógica por frame). O importante aqui é o `exit()` centralizado: como cada estado tem sua própria `Scene`, chamar `scene.dispose()` já libera meshes, materiais, texturas e observers registrados nela — isso sozinho evita boa parte dos memory leaks comuns em jogos que trocam de fase.

### Pause como estado, não como "if global"

É tentador implementar pause com uma flag `isPaused` checada em todo `update()`. Isso funciona no começo mas se espalha por todo o código conforme o jogo cresce. Tratar pause como um estado que empilha sobre o estado anterior (sem descartar a cena de gameplay) e retoma o `runRenderLoop` a partir dele é mais fácil de manter à medida que o número de sistemas aumenta.

## Entidades: comece simples, evite ECS "por precaução"

Frameworks de Entity-Component-System (ECS) completos existem para Babylon.js e resolvem problemas reais de jogos com centenas de tipos de entidade interagindo de formas variadas. Mas para a maioria dos jogos — especialmente os primeiros — uma classe por tipo de entidade com composição simples é mais fácil de entender e depurar:

```ts
export class Enemy {
  public readonly mesh: AbstractMesh;
  private health = 100;

  constructor(mesh: AbstractMesh) {
    this.mesh = mesh;
  }

  update(deltaTime: number): void {
    // lógica de IA/movimento
  }

  takeDamage(amount: number): void {
    this.health -= amount;
    if (this.health <= 0) this.dispose();
  }

  dispose(): void {
    this.mesh.dispose();
  }
}
```

Considere migrar para ECS só quando sentir a dor real que ele resolve: muitas combinações de comportamento reutilizáveis entre tipos de entidade diferentes (ex.: "voa" + "atira" + "tem vida" combinados de formas variadas). Introduzir ECS antes disso costuma adicionar complexidade sem benefício correspondente.

## `metadata` para dados de gameplay em meshes

Ao invés de criar mapas paralelos (`Map<Mesh, EnemyData>`) para associar dados de jogo a uma mesh, o Babylon.js já expõe a propriedade `mesh.metadata` (livre, qualquer objeto) para isso — é a forma idiomática de anexar estado de gameplay a um nó da cena sem estruturas externas para manter sincronizadas.

## Onde colocar cada coisa (resumo)

| Responsabilidade | Onde vive |
|---|---|
| Loop de render, delta time | `Game` |
| Troca de fase do jogo | `StateManager` / `GameState` |
| Câmera, luzes, assets de uma fase específica | dentro do `enter()` daquele `GameState` |
| Lógica e estado de uma entidade | classe da entidade, referenciada pelo estado |
| Física, input, áudio (reutilizáveis entre estados) | `systems/`, injetados no estado que precisar |

Veja `gameplay-systems.md` para como implementar os sistemas citados na última linha, e `performance.md` para cuidados de otimização que também são decisões de arquitetura (ex.: pooling de entidades em vez de criar/destruir a cada frame).
