# SPEC-01 — Wrapper do coaching overlay do 8th Wall (onda 1, paralelo)

> Leia `docs/specs/README.md` antes: convencoes obrigatorias e mapa de arquivos.
> Depende do SPEC-00 (tipos ja no repo). Nao depende de nenhum outro spec.

## Objetivo

A sessao de RA roda com `XR8.XrController.configure({ scale: "absolute" })`.
Escala absoluta so converge depois que o SLAM ganha paralaxe — o jogador precisa
mover o celular para frente e para tras. Hoje nada pede isso, e a arena pode ser
ancorada antes da escala convergir, o que produz arena com tamanho e
profundidade errados.

O 8th Wall distribui um *Absolute Scale Coaching Overlay* pronto
(`@8thwall/coaching-overlay`, MIT) exatamente para essa etapa. Ele ja vem
carregado pelo `<script>` em `index.html` (SPEC-00) e se expoe em
`window.CoachingOverlay`.

Este spec cria **um unico arquivo novo**: o wrapper que isola esse global do
resto do codigo. Nenhum outro modulo do projeto pode tocar em
`window.CoachingOverlay` — so este.

## Arquivos que este spec PODE escrever (exclusivos)

- `src/ar/coachingOverlay.ts` (novo)

## Arquivos que pode apenas LER

- `src/types/xr8.d.ts` — tipos `CoachingOverlayApi`, `XR8Api`
- `src/ar/babylonRuntimeGlobals.ts` — padrao de modulo que encapsula um global (siga o estilo)
- `.github/copilot-instructions.md`, `README.md`

## Contrato

```ts
/**
 * Configura e liga o coaching overlay de escala absoluta do 8th Wall.
 * Retorna false quando o script nao carregou — nesse caso a RA segue
 * funcionando sem o overlay, entao NUNCA lance.
 */
export function attachCoachingOverlay(xr8: XR8Api): boolean;

/** Remove o modulo; o proprio `onRemove` do overlay desmonta o DOM. */
export function detachCoachingOverlay(xr8: XR8Api): void;
```

## Comportamento

`attachCoachingOverlay`:

1. Se `window.CoachingOverlay` nao existir, logar um `console.warn` e retornar
   `false`.
2. Chamar `configure` com os textos do jogo (pt-BR sem acentos, como o resto do
   projeto) e as cores do HUD:
   ```ts
   promptText: "Mova o celular para frente e para tras",
   promptColor: "#f8fafc",
   animationColor: "#22c55e",
   ```
3. `xr8.addCameraPipelineModule(window.CoachingOverlay.pipelineModule())` dentro
   de `try/catch` — retornar `false` se lancar.
4. Retornar `true`.

`detachCoachingOverlay`:

- `xr8.removeCameraPipelineModule("coaching-overlay")` dentro de `try/catch`.
- O nome `"coaching-overlay"` e o `name` do modulo, confirmado no bundle;
  exporte-o como constante nomeada em vez de repetir a string solta.

## Fatos do bundle que motivam o desenho (confirmados por inspecao, nao suponha outra coisa)

- O criterio de exibicao do overlay e, literalmente:
  `mostra` quando `trackingStatus === "LIMITED" && trackingReason === "INITIALIZING"`;
  `esconde` quando `trackingStatus === "NORMAL"`.
  Ou seja, **`NORMAL` e o sinal oficial de "calibrado"** — e por isso que existe
  um `detach`: se o tracking degradar no meio da partida, o overlay poderia
  reaparecer por cima do jogo, e removemos o modulo para impedir isso.
- O modulo se chama `coaching-overlay` e escuta o evento `reality.trackingstatus`
  do framework do engine.
- O overlay e **DOM** (`position: fixed`, `z-index: 412`), montado em
  `document.body`. Ele nao interage com o HUD Babylon — nao tente integra-lo a
  `AdvancedDynamicTexture`.

## Criterios de aceite

- [ ] `src/ar/coachingOverlay.ts` existe e exporta exatamente as duas funcoes do contrato.
- [ ] Nenhuma chamada lanca quando `window.CoachingOverlay` e `undefined` (caminho de degradacao).
- [ ] O nome do modulo (`"coaching-overlay"`) esta numa constante, nao repetido em string literal.
- [ ] Nenhum outro arquivo do repo foi editado.
- [ ] O arquivo ainda nao e importado por ninguem — a fiacao e do SPEC-06. Isso e esperado.

## Verificacao

```bash
npx tsc --noEmit && npm run test
```
