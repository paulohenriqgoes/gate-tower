# SPEC-02 — Overlay de diagnostico em tela (onda 1, paralelo)

> Leia `docs/specs/README.md` antes: convencoes obrigatorias e mapa de arquivos.
> Nao depende de nenhum outro spec da onda 1.

## Objetivo

Precisamos decidir, com dados de device, se a RA pode rodar em paisagem. O
celular **nao tem console acessivel**, entao qualquer numero que importe tem que
ir para a propria tela. Hoje nao existe nada disso: a unica informacao exposta e
o texto de status de RA no HUD.

Este spec cria **um unico arquivo novo**: um painel de debug que mostra o estado
de viewport, orientacao e tracking. Ele fica atras de `?debug=1` para nunca
aparecer em producao.

## Arquivos que este spec PODE escrever (exclusivos)

- `src/ui/DiagnosticsOverlay.ts` (novo)

## Arquivos que pode apenas LER

- `src/ui/HudLayer.ts` — API `getTexture()`, e o padrao de posicionamento em px do espaco ideal
- `src/ui/screenOrientation.ts` — `isFullscreen()`, `onOrientationChange()`
- `src/ui/CardDeckHud.ts` — exemplo de componente que vive na textura compartilhada
- `.github/copilot-instructions.md`, `README.md`

## Contrato

```ts
export class DiagnosticsOverlay {
  /** true quando a URL tem `?debug=1`. Checar ANTES de instanciar. */
  public static isEnabled(): boolean;

  public constructor(hud: HudLayer, scene: Scene);

  /** Campo avulso (ex.: "trackingStatus" -> "NORMAL"). Sobrescreve o anterior. */
  public setField(key: string, value: string): void;

  public setFields(fields: Record<string, string>): void;

  /** Recalcula sozinho o que da para ler do DOM/engine. Idempotente. */
  public refreshViewportFields(): void;

  public dispose(): void;
}
```

## Comportamento

- Um `TextBlock` monoespacado (`fontFamily = "ui-monospace, monospace"`,
  `fontSize` pequeno, ~13) dentro de um `Rectangle` com fundo escuro
  semitransparente, ancorado no **canto inferior direito**,
  `isHitTestVisible = false` e `isPointerBlocker = false` — o painel nunca pode
  roubar toque do jogo.
- Adicionado via `hud.getTexture().addControl(...)`. **Nao crie outra
  `AdvancedDynamicTexture`.**
- Os campos sao mantidos num `Map<string, string>` e renderizados como
  `chave: valor`, uma por linha, em ordem de insercao — assim a ordem fica
  estavel entre atualizacoes e da para ler no celular sem procurar.

`refreshViewportFields()` preenche sozinho, sem depender de ninguem:

| Campo | Origem |
| --- | --- |
| `orientation` | `screen.orientation.type` e `.angle` |
| `canvasCss` | `canvas.clientWidth` x `clientHeight` (px CSS) |
| `canvasPx` | `canvas.width` x `canvas.height` (px de dispositivo) |
| `render` | `engine.getRenderWidth()` x `getRenderHeight()` |
| `canvasAspect` | razao do canvas CSS, 2 casas decimais |
| `fullscreen` | `isFullscreen()` de `screenOrientation.ts` |
| `dpr` | `window.devicePixelRatio` |

O canvas sai de `scene.getEngine().getRenderingCanvas()`; trate `null`.

- Assinar `onOrientationChange(() => this.refreshViewportFields())` no
  construtor e **desassinar no `dispose()`** (a funcao devolve o descarte).
- Chamar `refreshViewportFields()` uma vez no construtor.
- `dispose()` tambem descarta os controles criados.

Campos que **este spec nao preenche** (vem de fora, via `setField`, no SPEC-06):
`trackingStatus`, `trackingReason`, `videoSize`, `videoAspect`. Nao invente uma
forma de le-los daqui — o dono do elemento de video e o engine, e ele so entrega
esses dados nos callbacks do pipeline module.

## Por que este overlay importa

Registrado como resultado de campo: com o app travado em paisagem, o tracking de
RA fica inutilizavel no device (objetos deslizam a qualquer movimento); em
portrait o mesmo codigo funciona. A hipotese que sobrou e a geometria das
intrinsics — canvas ~20:9 em tela cheia contra video 4:3/16:9 —, e o unico jeito
de confirmar ou descartar isso e **medir `canvasAspect` contra `videoAspect` no
device**. E por isso que esses dois campos existem.

## Criterios de aceite

- [ ] `DiagnosticsOverlay.isEnabled()` retorna `true` so com `?debug=1` na URL.
- [ ] O painel nunca bloqueia ponteiro (`isPointerBlocker = false` e `isHitTestVisible = false` em todos os controles).
- [ ] `dispose()` remove o listener de orientacao e descarta os controles.
- [ ] Chamar `setField` com uma chave ja existente atualiza o valor sem duplicar a linha.
- [ ] Nenhum outro arquivo do repo foi editado; ninguem importa a classe ainda (a fiacao e do SPEC-06).

## Verificacao

```bash
npx tsc --noEmit && npm run test
```
