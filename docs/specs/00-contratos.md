# SPEC-00 — Contratos (onda 0, serial)

> Leia `docs/specs/README.md` antes: convencoes obrigatorias e mapa de arquivos.

## Objetivo

Hoje a superficie publica dos modulos nao suporta o fluxo novo: o
`EighthWallARManager` e dono do switch de RA e so expoe `initialize()`, o
`CombatEngine` nao sabe ficar inativo, e nao ha tipos para o coaching overlay do
8th Wall. Este spec **fixa tipos e assinaturas** — sem implementar
comportamento novo — para que os specs 01 a 05 possam ser escritos em paralelo
sem inventar cada um a sua propria API.

Regra deste spec: **assinatura completa, corpo minimo**. Onde o comportamento
final e de outro spec, deixe o corpo vazio ou com o comportamento atual, e um
comentario `// Implementado em SPEC-NN`. O projeto tem que compilar e rodar em
modo tela ao final.

**Consequencia esperada e aceitavel:** ao final deste spec o modo RA fica
temporariamente inalcancavel pela UI (o switch e removido e o menu que vai
chamar `enterAR()` so nasce no SPEC-04). Isso e transitorio e nao e um bug —
nao tente compensar recriando o switch.

## Arquivos que este spec PODE escrever (exclusivos)

- `src/types/xr8.d.ts` (editar)
- `src/game/GameTypes.ts` (novo)
- `src/ar/ArSessionController.ts` (novo)
- `src/ui/screenOrientation.ts` (editar)
- `src/ar/EighthWallARManager.ts` (editar — so assinaturas e remocoes)
- `src/combat/CombatEngine.ts` (editar — so assinatura)
- `src/ui/CardDeckHud.ts` (editar — so assinatura)
- `src/ui/HudLayer.ts` (editar — so assinatura)
- `index.html` (editar)
- `package.json` (editar)
- `scripts/copy-8thwall.mjs` (editar)

**Nao apague `src/ui/ToggleSwitch.ts`** — o SPEC-06 cuida disso.

## Arquivos que pode apenas LER

- `src/main.ts` — para conferir que continua compilando
- `.github/copilot-instructions.md`, `README.md`

---

## 1. `src/types/xr8.d.ts`

Acrescentar ao bloco `declare global` existente:

```ts
type XR8TrackingReason = "INITIALIZING" | "UNDEFINED" | (string & {});

/**
 * Campos que o engine entrega nos callbacks do pipeline module. A tipagem e
 * parcial de proposito: o bundle e fechado e entrega mais coisas do que o que
 * usamos, entao o index signature deixa o SPEC-02 inspecionar o resto.
 */
interface XR8PipelineEvent {
  canvas?: HTMLCanvasElement;
  canvasWidth?: number;
  canvasHeight?: number;
  framework?: { dispatchEvent: (name: string, detail?: unknown) => void };
  orientation?: number;
  video?: HTMLVideoElement;
  videoWidth?: number;
  videoHeight?: number;
  [key: string]: unknown;
}

interface CoachingOverlayApi {
  configure: (params: {
    animationColor?: string;
    disablePrompt?: boolean;
    promptColor?: string;
    promptText?: string;
  }) => void;
  pipelineModule: () => XR8CameraPipelineModule;
}
```

Estender `XR8CameraPipelineModule` com os campos opcionais que o modulo do
coaching overlay usa — sem eles o tipo rejeita o retorno de `pipelineModule()`:

```ts
interface XR8CameraPipelineModule {
  name: string;
  listeners?: { event: string; process: (event: { detail?: unknown }) => void }[];
  onAttach?: (event: XR8PipelineEvent) => void;
  onDetach?: (event?: XR8PipelineEvent) => void;
  onRemove?: (event?: XR8PipelineEvent) => void;
  onVideoSizeChange?: (event: XR8PipelineEvent) => void;
  // ...os campos que ja existem hoje (onCameraStatusChange, onException,
  // onStart, onUpdate) permanecem
}
```

No `onUpdate`, tipar o motivo do tracking, que hoje e `string` solto:

```ts
trackingReason?: XR8TrackingReason;
```

E declarar o global do overlay:

```ts
interface Window {
  XR8?: XR8Api;
  CoachingOverlay?: CoachingOverlayApi;
}
```

## 2. `src/game/GameTypes.ts` (novo)

```ts
/** Modo de render escolhido antes da partida. */
export type GameMode = "ar" | "canvas";

/** Fase do fluxo de jogo. */
export type GamePhase = "menu" | "ar-setup" | "playing";
```

## 3. `src/ar/ArSessionController.ts` (novo)

Interface que o `GameFlow` (SPEC-04) consome. Existe para inverter a
dependencia: o fluxo de jogo depende de uma abstracao, nao da implementacao do
8th Wall — e o SPEC-04 pode ser escrito e testado sem a classe concreta pronta.

```ts
import type { Observable } from "@babylonjs/core/Misc/observable";

/**
 * Contrato da sessao de RA visto pelo fluxo de jogo. Mantem a regra de que a
 * logica de jogo nao conhece o engine de RA.
 */
export interface ArSessionController {
  /** Arena ancorada no piso real pelo toque do jogador. */
  readonly onArenaPlacedObservable: Observable<void>;
  /** Jogador confirmou o posicionamento no botao "Comecar". */
  readonly onMatchStartRequestedObservable: Observable<void>;
  /** Sessao caiu ou nao subiu; carrega a mensagem para o menu exibir. */
  readonly onSessionFailedObservable: Observable<string>;

  /** Engine carregado e device compativel. */
  isARAvailable(): boolean;
  isSessionActive(): boolean;
  enterAR(): Promise<void>;
  exitAR(): void;
  /** Volta para a fase de posicionamento sem derrubar a sessao. */
  repositionArena(): void;
  /** Encerra a fase de setup: some com o painel de setup e o coaching overlay. */
  completeSetup(): void;
}
```

## 4. `src/ui/screenOrientation.ts`

Implementar **por completo** (nao e stub) o par de `enterImmersiveMode`:

```ts
/**
 * Solta a trava de orientacao e sai da tela cheia. Usado ao entrar em RA: em
 * paisagem travada o tracking do 8th Wall fica inutilizavel no device, e com o
 * lock ativo o SO para de emitir `orientationchange`, dessincronizando o que o
 * engine reporta ao WASM da pose fisica real do aparelho.
 */
export async function exitImmersiveMode(): Promise<void>
```

Comportamento: chamar `screen.orientation.unlock?.()` dentro de `try/catch`
(nao existe no Safari do iPhone) e depois `exitFullscreen()`. Nunca lancar.

Corrigir tambem o comentario do topo do arquivo, que hoje afirma que o jogo "e
desenhado para paisagem" como politica global — passa a ser politica **do modo
tela**, enquanto a RA roda sem trava.

## 5. `src/ar/EighthWallARManager.ts` — so superficie

Mudancas de assinatura, sem comportamento novo:

1. `export class EighthWallARManager implements ArSessionController`.
2. Adicionar os tres observables publicos (`Observable` de
   `@babylonjs/core/Misc/observable`), ja notificados nos pontos obvios que hoje
   so escrevem no HUD:
   - `onArenaPlacedObservable` — notificar em `registerTouchPlacement`, logo
     apos `this.hasUserPlacedArenaInXR = true` (linha ~481);
   - `onSessionFailedObservable` — notificar nos tres caminhos de falha que hoje
     so chamam `updateUI(..., true)`: `enterAR` catch (~633),
     `onCameraStatusChange` failed (~702) e `onException` (~710);
   - `onMatchStartRequestedObservable` — declarado, ainda sem emissor (o botao
     "Comecar" nasce no SPEC-06).
3. `enterAR` e `exitAR` passam de `private` a **`public`**. `enterAR` muda a
   assinatura para `public async enterAR(): Promise<void>` — resolve
   `window.XR8` internamente em vez de receber por parametro, e sai cedo com
   `onSessionFailedObservable.notifyObservers("RA indisponivel")` se nao houver
   engine.
4. Novos metodos publicos com corpo minimo:
   - `public isARAvailable(): boolean` — `return this.isXR8Ready && this.isARSupported;` (ja da para implementar de verdade);
   - `public repositionArena(): void` — `// Implementado em SPEC-06`, corpo vazio;
   - `public completeSetup(): void` — `// Implementado em SPEC-06`, corpo vazio.
5. **Remover** o `ToggleSwitch`: o campo `toggleSwitch`, sua criacao em
   `createBabylonToggleUI`, o metodo `toggleAR()` e o `hud.fillSlot("ar-toggle", ...)`.
   Em `updateUI`, trocar o early-return `if (!this.toggleSwitch) return;` por um
   guard equivalente (ex.: `if (!this.scaleButton) return;`) e remover as tres
   chamadas `this.toggleSwitch.*`.
6. Remover o import de `ToggleSwitch` (o arquivo continua no repo).

## 6. Stubs nos modulos de gameplay

- `src/combat/CombatEngine.ts`:
  ```ts
  /** Fora da partida o combate nao roda nem responde a toque. */
  public setActive(isActive: boolean): void
  ```
  Adicionar o campo `private isActive = true;` e o setter. **Nao** aplique ainda
  os early-returns em `update()` e no handler de ponteiro — isso e do SPEC-05.

- `src/ui/CardDeckHud.ts`:
  ```ts
  /** Esconde coluna de cartas e anel de cogumelos fora da partida. */
  public setVisible(isVisible: boolean): void
  ```
  Corpo vazio + `// Implementado em SPEC-05`.

- `src/ui/HudLayer.ts`:
  ```ts
  /** Liga/desliga as duas linhas de status (RA e carta selecionada). */
  public setStatusVisible(isVisible: boolean): void
  ```
  Corpo vazio + `// Implementado em SPEC-05`.
  Remover `"ar-toggle"` de `HudTopBarSlot`, `SLOT_ORDER` e `SLOT_WIDTHS` (o
  unico consumidor sai no item 5 acima).

## 7. Carregamento do coaching overlay

- `package.json`: adicionar `"@8thwall/coaching-overlay": "^1.0.0"` em
  `dependencies`, em ordem alfabetica (antes de `@babylonjs/core`).
- `scripts/copy-8thwall.mjs`: generalizar para copiar dois pares
  origem → destino. Copie o **diretorio inteiro** do coaching overlay, nao so o
  `.js` — ele traz o `LICENSE` junto, e servir esse arquivo mantem a atribuicao:
  - `node_modules/@8thwall/engine-binary/dist` → `public/8thwall`
  - `node_modules/@8thwall/coaching-overlay/dist` → `public/coaching-overlay`

  O script deve tolerar um pacote ausente (avisar e seguir) em vez de quebrar o
  `postinstall`.
- `index.html`, logo abaixo do `<script>` do engine:
  ```html
  <script src="/coaching-overlay/coaching-overlay.js" async crossorigin="anonymous"></script>
  ```
  O bundle termina com
  `Object.assign(window, {CoachingOverlay: {...}, SkyCoachingOverlay: {...}})`,
  entao ele se expoe sozinho em `window.CoachingOverlay`.

## 8. `index.html` — overlay de rotacao condicional

Hoje `#rotate-prompt` aparece por media query pura
(`@media (orientation: portrait) and (pointer: coarse)`), o que o faria cobrir a
tela durante a RA em portrait. Passa a exigir tambem uma classe no `<body>`:

```css
@media (orientation: portrait) and (pointer: coarse) {
  body.needs-landscape #rotate-prompt { display: flex; /* ...resto igual... */ }
}
```

Quem liga/desliga `document.body.classList.toggle("needs-landscape", ...)` e o
`GameFlow` (SPEC-04) — nao adicione JS para isso aqui.

## Criterios de aceite

- [ ] `npx tsc --noEmit` passa.
- [ ] `npm run test` passa (os testes de `hitTestSampling` e `arenaFraming` nao sao tocados).
- [ ] `npm run build` passa.
- [ ] `npm run dev` sobe e o jogo roda em modo tela; a barra superior nao tem mais o switch de RA e nao ficou buraco no lugar (o `StackPanel` fecha o vao sozinho).
- [ ] `EighthWallARManager` compila declarando `implements ArSessionController`.
- [ ] Nenhum arquivo fora da lista foi editado; `src/ui/ToggleSwitch.ts` continua existindo.

## Verificacao

```bash
npx tsc --noEmit && npm run test && npm run build
```
