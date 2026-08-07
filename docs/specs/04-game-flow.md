# SPEC-04 — Maquina de estados do jogo (onda 1, paralelo)

> Leia `docs/specs/README.md` antes: convencoes obrigatorias e mapa de arquivos.
> Depende so das assinaturas fixadas no SPEC-00, que ja estao no repo.

## Objetivo

O projeto **nao tem maquina de estados de jogo**. `createScene()` em
`src/main.ts` cria arena, HUD, cartas e combate visiveis no frame 1, e
`startRegeneration()` comeca a contar cogumelos antes de existir partida. Nao ha
nocao de "menu", "posicionando a arena" e "jogando".

Este spec cria **um unico arquivo novo**: o orquestrador que liga e desliga cada
subsistema conforme a fase. Ele e o unico modulo que conhece todos os outros —
nenhum dos outros conhece ele.

## Arquivos que este spec PODE escrever (exclusivos)

- `src/game/GameFlow.ts` (novo)

## Arquivos que pode apenas LER

- `src/game/GameTypes.ts` — `GameMode`, `GamePhase`
- `src/ar/ArSessionController.ts` — o contrato da sessao de RA
- `src/ui/StartScreen.ts` — assinatura (pode ainda nao existir enquanto o SPEC-03 roda; use o contrato abaixo)
- `src/cards/CardDeckSystem.ts` — `startRegeneration()`, `stopRegeneration()`
- `src/ui/CardDeckHud.ts` — `setVisible()`
- `src/ui/HudLayer.ts` — `setStatusVisible()`, `setSlotVisible()`
- `src/combat/CombatEngine.ts` — `setActive()`
- `src/ui/screenOrientation.ts` — `installImmersiveModeOnGesture()`
- `.github/copilot-instructions.md`, `README.md`

## Contrato

```ts
export interface GameFlowOptions {
  arManager: ArSessionController;
  arenaRoot: TransformNode;
  canvas: HTMLCanvasElement;
  cardDeckHud: CardDeckHud;
  cardDeckSystem: CardDeckSystem;
  combatEngine: CombatEngine;
  hudLayer: HudLayer;
  startScreen: StartScreen;
}

export class GameFlow {
  public constructor(options: GameFlowOptions);

  /** Entra na fase `menu`. Chamar uma vez, no bootstrap. */
  public start(): void;

  public getPhase(): GamePhase;

  public dispose(): void;
}
```

## Fases

| Fase | O que fica ligado |
| --- | --- |
| `menu` | `startScreen.show()`; `arenaRoot.setEnabled(false)`; `cardDeckHud.setVisible(false)`; `hudLayer.setStatusVisible(false)`; `cardDeckSystem.stopRegeneration()`; `combatEngine.setActive(false)`; classe `needs-landscape` **removida** do `<body>` |
| `ar-setup` | `startScreen.hide()`; sessao de RA no ar; combate ainda inativo; cartas ainda escondidas. A arena e habilitada pelo proprio `ArSessionController` quando o jogador ancora |
| `playing` | `arenaRoot.setEnabled(true)`; `cardDeckHud.setVisible(true)`; `hudLayer.setStatusVisible(true)`; `cardDeckSystem.startRegeneration()`; `combatEngine.setActive(true)` |

Em `playing` **no modo `ar`**: nao mexa em `arenaRoot.setEnabled` — quem
posicionou foi o `ArSessionController`, e reabilitar aqui e inofensivo mas
reposicionar nao e. Guarde o `GameMode` atual num campo e use-o para decidir.

## Transicoes

- `start()` → fase `menu`. Assinar `startScreen.onModeSelectedObservable`.
- `menu` + `"canvas"` → aplicar politica de orientacao paisagem, depois fase `playing`.
- `menu` + `"ar"` → `void arManager.enterAR()` e fase `ar-setup`.
- `ar-setup` + `arManager.onMatchStartRequestedObservable` → `arManager.completeSetup()`, depois fase `playing`.
- Qualquer fase + `arManager.onSessionFailedObservable` → `startScreen.setMessage(mensagem)` e volta para `menu`.

Ao entrar em `menu` vindo de uma sessao de RA, chamar `arManager.exitAR()` se
`arManager.isSessionActive()`.

## Politica de orientacao por modo

Este e o ponto sutil do spec. O jogo e desenhado para paisagem, mas **em RA a
trava de paisagem quebra o tracking no device** — objetos deslizam a qualquer
movimento —, enquanto em portrait o mesmo codigo funciona. Com o modo escolhido
antes da partida, da para ter duas politicas em vez de uma global:

- **modo `canvas`**: `document.body.classList.add("needs-landscape")` (liga o
  overlay CSS de "gire o celular" de `index.html`) e
  `installImmersiveModeOnGesture(canvas, () => arManager.isSessionActive())` —
  tela cheia e trava de orientacao no proximo gesto.
- **modo `ar`**: **nao** instalar nada disso e **remover** a classe
  `needs-landscape`. Quem sai da tela cheia e solta a trava e o proprio
  `enterAR()` (ja faz isso via `exitImmersiveMode`).

`installImmersiveModeOnGesture` hoje e chamado no bootstrap de `src/main.ts`, o
que faz o app entrar em tela cheia e paisagem **no primeiro toque — que e o
toque do proprio menu**, antes de saber o modo. Por isso ele passa a ser
responsabilidade desta classe. (A remocao da chamada em `main.ts` e do SPEC-06;
nao edite `main.ts` aqui.) Instale-o **uma unica vez** mesmo que o jogador
volte ao menu e escolha `canvas` de novo.

## Cuidados

- Guarde os `Observer` retornados por cada `.add(...)` e remova todos no
  `dispose()`. Observable vazando entre partidas e a fonte classica de acao
  duplicada.
- `setPhase` deve ser idempotente e centralizar todo o liga/desliga num unico
  lugar — nada de espalhar `setActive(false)` por varios handlers.
- Nao chame `startRegeneration()` mais de uma vez sem `stopRegeneration()`
  antes; o `CardDeckSystem` ja se protege, mas nao dependa disso.
- Este modulo nao importa nada de `@8thwall` nem de `EighthWallARManager` — so a
  interface `ArSessionController`. Se voce precisou importar a classe concreta,
  o desenho esta errado.

## Criterios de aceite

- [ ] `GameFlow` compila importando apenas `ArSessionController`, nunca `EighthWallARManager`.
- [ ] Todos os observers assinados sao removidos em `dispose()`.
- [ ] Falha de sessao em qualquer fase leva a `menu` com a mensagem no `StartScreen`.
- [ ] No modo `ar`, a classe `needs-landscape` nao fica no `<body>`.
- [ ] Nenhum outro arquivo do repo foi editado; ninguem instancia a classe ainda (a fiacao e do SPEC-06).

## Verificacao

```bash
npx tsc --noEmit && npm run test
```
