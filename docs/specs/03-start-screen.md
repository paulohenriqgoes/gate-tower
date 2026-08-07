# SPEC-03 — Tela inicial de escolha de modo (onda 1, paralelo)

> Leia `docs/specs/README.md` antes: convencoes obrigatorias e mapa de arquivos.
> Nao depende de nenhum outro spec da onda 1.

## Objetivo

Hoje o jogo abre com tudo na tela: arena, torres, cartas e contador de cogumelos
aparecem no primeiro frame, e a escolha entre RA e modo tela e um switch no meio
do HUD. Nao existe momento em que o jogador decide o que vai jogar.

Este spec cria **um unico arquivo novo**: a tela inicial que cobre a cena e
oferece os dois modos. Quem reage a escolha e o `GameFlow` (SPEC-04) — esta tela
so notifica, nao muda estado de jogo.

## Arquivos que este spec PODE escrever (exclusivos)

- `src/ui/StartScreen.ts` (novo)

## Arquivos que pode apenas LER

- `src/ui/HudLayer.ts` — `getTexture()` e o sistema de px do espaco ideal
- `src/ui/FullscreenToggle.ts` e `src/ui/ToggleSwitch.ts` — padrao visual de botao/controle (cores, `cornerRadius`, `fontFamily`)
- `src/game/GameTypes.ts` — o tipo `GameMode`
- `.github/copilot-instructions.md`, `README.md`

## Contrato

```ts
import type { GameMode } from "../game/GameTypes";

export class StartScreen {
  public readonly onModeSelectedObservable: Observable<GameMode>;

  public constructor(hud: HudLayer);

  public show(): void;
  public hide(): void;

  /** Esmaece e inerta o botao de RA quando o device/engine nao suporta. */
  public setArAvailable(isAvailable: boolean): void;

  /** Linha de aviso sob os botoes (ex.: "Permissao de camera negada"). */
  public setMessage(message: string): void;

  public dispose(): void;
}
```

## Comportamento

- Um `Rectangle` fullscreen (`width = "100%"`, `height = "100%"`, `thickness = 0`)
  com fundo escuro semitransparente (ex.: `#090e13e6`) e
  **`isPointerBlocker = true`** — enquanto o menu esta visivel, nenhum toque pode
  vazar para a cena.
- Dentro, um `StackPanel` vertical centralizado com:
  - titulo `"Tower Gate"`, fonte grande, `fontFamily = "Trebuchet MS"` (o padrao do HUD);
  - subtitulo curto explicando a escolha;
  - botao **"Jogar em RA"** — notifica `onModeSelectedObservable` com `"ar"`;
  - botao **"Jogar na tela"** — notifica com `"canvas"`;
  - `TextBlock` de mensagem, vazio por padrao, `textWrapping = true`.
- Adicionado via `hud.getTexture().addControl(...)`. **Nao crie outra
  `AdvancedDynamicTexture`** — a compartilhada existe justamente para evitar
  isso (ver comentario em `src/ui/HudLayer.ts:33-38`).
- Comeca **escondido** (`isVisible = false`); quem chama `show()` e o `GameFlow`.
- `setArAvailable(false)`: `alpha = 0.35` no botao de RA e o clique vira no-op
  (guard no handler, nao remova o observer). Estado inicial: **indisponivel** —
  o engine do 8th Wall carrega de forma assincrona, entao so libere quando
  mandarem.
- `setMessage("")` esconde a linha de mensagem.
- `dispose()` descarta o `Rectangle` raiz e limpa o `Observable`.

## Cuidados

- Este componente **nao** conhece `EighthWallARManager`, `CombatEngine` nem
  `CardDeckSystem`. Ele so emite a escolha. Se voce sentiu vontade de importar
  qualquer um deles, o desenho esta errado.
- O layout precisa sobreviver a paisagem **e** portrait: use
  `horizontalAlignment`/`verticalAlignment` centralizados e larguras em
  percentual, nunca offsets fixos calculados a partir de uma orientacao. O HUD
  usa `idealWidth 1280 / idealHeight 720` com `useSmallestIdeal`, entao valores
  em px sao reescalados sozinhos.
- Botao com area de toque generosa (altura >= 64px no espaco ideal): o alvo real
  e um dedo em celular.

## Criterios de aceite

- [ ] `npm run dev` no desktop: nada da cena aparece atras do menu por toque acidental (o menu bloqueia ponteiro).
- [ ] Clicar em cada botao notifica `onModeSelectedObservable` com o `GameMode` correto, uma unica vez por clique.
- [ ] Com `setArAvailable(false)`, clicar em "Jogar em RA" nao notifica nada.
- [ ] O menu comeca escondido e so aparece apos `show()`.
- [ ] Nenhum outro arquivo do repo foi editado; ninguem instancia a classe ainda (a fiacao e do SPEC-06).

## Verificacao

```bash
npx tsc --noEmit && npm run test
```
