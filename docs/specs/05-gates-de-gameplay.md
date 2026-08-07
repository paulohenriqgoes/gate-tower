# SPEC-05 — Gates de gameplay (onda 1, paralelo)

> Leia `docs/specs/README.md` antes: convencoes obrigatorias e mapa de arquivos.
> Os tres metodos ja existem como stub (SPEC-00). Este spec implementa o corpo.

## Objetivo

O jogo nao sabe ficar "fora de partida": o combate roda desde o primeiro frame,
o toque na tela sempre tenta invocar carta, e o HUD de cartas esta sempre
visivel. Com a tela inicial e a fase de posicionamento de RA entrando, esses
tres subsistemas precisam poder ser desligados.

Este spec implementa **o corpo dos tres metodos** ja declarados como stub no
SPEC-00. Nao adicione API nova.

## Arquivos que este spec PODE escrever (exclusivos)

- `src/combat/CombatEngine.ts`
- `src/ui/CardDeckHud.ts`
- `src/ui/HudLayer.ts`

## Arquivos que pode apenas LER

- `.github/copilot-instructions.md`, `README.md`

## 1. `CombatEngine.setActive(isActive: boolean)`

O campo `private isActive` e o setter ja existem. Falta aplicar:

- Em `update()` (chamado por `scene.onBeforeRenderObservable`): retornar cedo
  quando `!this.isActive`. Nenhuma unidade anda, nenhuma torre atira, nenhum
  morto e coletado enquanto inativo.
- No handler de `POINTERDOWN` registrado no construtor: retornar cedo quando
  `!this.isActive`, **antes** de ler `pickInfo`.

Por que o segundo importa: `EighthWallARManager` assina o **mesmo**
`scene.onPointerObservable` para o toque que ancora a arena. Hoje o toque de
posicionamento tambem cai no handler de deploy, e so nao causa efeito por
acidente — porque `arenaRoot` esta desabilitado naquele instante. Com o gate
explicito isso deixa de ser sorte.

Mantenha o guard existente `if (!this.arenaRoot.isEnabled()) return false;` em
`tryDeploySelectedCardAtWorldPoint` — ele cobre outro caso e nao e redundante.

Escolha do valor inicial: o campo nasce `true` para nao mudar o comportamento de
quem ainda nao chama `setActive`. Quem desliga no boot e o `GameFlow`.

## 2. `CardDeckHud.setVisible(isVisible: boolean)`

Alternar `isVisible` de **`this.cardColumn`** (coluna de losangos na borda) e
**`this.ringContainer`** (anel de cogumelos no slot da barra superior).

Cuidados:

- Nao chame `dispose()` nem remova controles — `setVisible` tem que ser
  reversivel, o jogador volta ao menu e joga de novo.
- A animacao de blink roda num `registerBeforeRender` e mexe em
  `ringContainer.alpha`. Ao esconder, isso e inofensivo (o controle esta
  invisivel), mas ao **reexibir** o alpha pode ter ficado em `0.4`. Restaure
  `alpha = 1` ao voltar a ficar visivel.
- Nao mexa no texto de status de carta aqui — quem controla as linhas de status
  e o `HudLayer` (item 3).

## 3. `HudLayer.setStatusVisible(isVisible: boolean)`

Alternar `isVisible` das **duas** `TextBlock` de status: `this.arStatusText`
(`hud-ar-status`) e `this.cardStatusText` (`hud-card-status`).

Cuidado com a interacao ja existente: `setArStatusVisible()` tambem mexe em
`arStatusText.isVisible`, e e chamado pelo `EighthWallARManager` durante o
posicionamento em RA (`refreshPlacementOverlay`). Os dois vao disputar o mesmo
controle. Resolva de forma explicita e documentada com um comentario curto:
guarde o estado "status ligado pela fase de jogo" num campo e faca o valor final
do `arStatusText` ser a **conjuncao** dos dois — sem isso, entrar em RA
reacende um status que o menu tinha apagado.

## Criterios de aceite

- [ ] Com `combatEngine.setActive(false)`, um toque na arena nao invoca unidade e nenhuma unidade existente se move.
- [ ] `setActive(true)` depois de `false` retoma o combate sem perder unidades ja criadas.
- [ ] `cardDeckHud.setVisible(false)` esconde coluna e anel; `true` devolve os dois com `alpha = 1`.
- [ ] `hudLayer.setStatusVisible(false)` seguido de `setArStatusVisible(true)` **nao** faz o status de RA reaparecer.
- [ ] Nenhuma assinatura publica nova foi criada; nenhum arquivo fora da lista foi editado.

## Verificacao

```bash
npx tsc --noEmit && npm run test
```
