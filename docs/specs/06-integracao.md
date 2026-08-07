# SPEC-06 — Integracao: calibracao, setup de RA e fiacao (onda 2, serial)

> Leia `docs/specs/README.md` antes: convencoes obrigatorias e mapa de arquivos.
> **So comece depois que a onda 1 inteira estiver mergeada e `npx tsc --noEmit` passar.**

## Objetivo

As pecas existem mas nao estao ligadas: o wrapper do coaching overlay
(SPEC-01), o overlay de diagnostico (SPEC-02), a tela inicial (SPEC-03) e a
maquina de estados (SPEC-04) foram escritos isoladamente e ninguem os instancia.
Falta tambem o comportamento novo do `EighthWallARManager`: hoje ele deixa
ancorar a arena com o SLAM ainda em `LIMITED`, ou seja, **antes da escala
absoluta convergir**.

Este spec e a juntada. E serial por natureza — mexe nos dois arquivos onde tudo
se encontra.

## Arquivos que este spec PODE escrever (exclusivos)

- `src/ar/EighthWallARManager.ts`
- `src/main.ts`
- `src/ui/ToggleSwitch.ts` (apagar)
- `README.md`

## Arquivos que pode apenas LER

- `src/ar/coachingOverlay.ts`, `src/ui/DiagnosticsOverlay.ts`, `src/ui/StartScreen.ts`, `src/game/GameFlow.ts`, `src/ar/ArSessionController.ts`
- `.github/copilot-instructions.md`, `README.md`

---

## 1. Gate de tracking: `NORMAL` obrigatorio

Fato que motiva a mudanca, confirmado por inspecao do bundle do
`@8thwall/coaching-overlay`: o criterio oficial de "calibrado" e literalmente
`trackingStatus === "NORMAL"` (o overlay aparece em
`LIMITED + INITIALIZING` e some em `NORMAL`). Hoje o projeto contradiz isso.

- `HITTEST_SAFE_STATUSES` passa de `["LIMITED", "NORMAL"]` para `["NORMAL"]`.
- Corrigir o comentario das linhas ~37-39, que ja afirmava "so NORMAL" enquanto
  a constante dizia o contrario — codigo e intencao divergiram.
- Nova constante `PLACEMENT_FALLBACK_MS = 30000` e campo
  `private hasFallbackUnlocked = false`.
- Timer de `PLACEMENT_FALLBACK_MS` disparado em `enterAR()`; limpo em `exitAR()`
  e no momento do placement. Ao disparar, `hasFallbackUnlocked = true` e
  `isTrackingReady()` passa a aceitar `LIMITED` tambem.
- Com o fallback ativo, o texto de `trackingHintText()` avisa que a precisao
  pode cair. Sem escape, um ambiente com pouca textura prende o jogador no
  overlay sem conseguir jogar.

## 2. Ciclo de vida dos pipeline modules

Bug atual: `enterAR()` chama `addCameraPipelineModule(this.createStatusPipelineModule())`
a cada entrada e **nunca remove** — entrar/sair/entrar acumula modulos.

- `enterAR()`: apos registrar o modulo de status, chamar
  `attachCoachingOverlay(xr8)` (de `src/ar/coachingOverlay.ts`).
- `exitAR()`: `xr8.removeCameraPipelineModule("gate-ar-status")` +
  `detachCoachingOverlay(xr8)`, ambos tolerantes a `window.XR8` ausente.
- `completeSetup()`: `detachCoachingOverlay(xr8)`. Sem isso, se o tracking
  degradar no meio da partida o overlay reaparece por cima do jogo.

O `ar-loader` Babylon que ja existe (`createLoaderUI`) passa a cobrir **apenas**
a janela "subindo a sessao / nenhum `trackingStatus` reportado ainda". Assim que
o engine comeca a reportar status, quem comunica a calibracao e o coaching
overlay oficial. Ajuste `refreshPlacementOverlay()` para isso — nao pode haver
dois indicadores girando ao mesmo tempo.

## 3. Orientacao: sair da trava ao entrar em RA

Em `enterAR()` (linhas ~592-597), trocar `enterImmersiveMode()` por
`exitImmersiveMode()` (criado no SPEC-00), mantendo o `waitForStableViewport()`
que ja existe — a viewport muda de qualquer forma.

Corrigir tambem o comentario logo acima, que afirma que o engine le a orientacao
"uma unica vez no init". **Isso e falso e ja foi refutado**: o engine recalcula
`orientation` a partir de `screen.orientation.angle` **a cada frame** e o entrega
ao WASM no `stageFrame`, junto com o IMU cru. O motivo real de mexer em
orientacao antes de subir a sessao e outro: redimensionar canvas e reprojetar a
cena no meio do tracking e ruido gratuito.

## 4. Painel de setup: "Reposicionar" e "Comecar"

O `arena-scale-panel` (criado em `createScaleSliderUI`, linha ~287) ganha dois
botoes alem do slider, visiveis **durante a fase de setup**:

- **"Reposicionar"** → `this.repositionArena()`.
- **"Comecar"** → `this.onMatchStartRequestedObservable.notifyObservers()`.
  Quem transiciona a fase e o `GameFlow`; o manager so avisa.

O botao `✓ OK` atual continua servindo ao ajuste de escala **durante a partida**
(quando o painel e aberto pelo botao `⤡` da barra superior). Os dois modos do
painel precisam ficar distinguiveis — use um campo de estado, nao dois paineis.

`repositionArena()`: `hasUserPlacedArenaInXR = false`, `arenaRoot.setEnabled(false)`,
religar o reticle e o loader/prompt via `updateUI()`. Nao derrubar a sessao.
Isso resolve a limitacao atual de que, uma vez posicionada, so da para refazer
saindo da RA.

`completeSetup()`: esconder o painel de setup, `detachCoachingOverlay`, e
liberar o botao `⤡` da barra (`isScaleButtonEnabled`).

## 5. Diagnostico em tela

No `createStatusPipelineModule`, alimentar o `DiagnosticsOverlay` quando ele
existir:

- `onUpdate` → `setFields({ trackingStatus, trackingReason })`. Hoje so o status
  e lido (`event.processCpuResult.reality.trackingStatus`); passe a ler tambem
  `trackingReason`.
- `onAttach` e `onVideoSizeChange` → `setFields({ videoSize: "WxH", videoAspect })`
  a partir de `videoWidth`/`videoHeight` do evento.
- `onAttach`, **uma unica vez**, despejar `Object.keys(event).join(",")` num
  campo. Os callbacks do engine sao tipados so parcialmente no projeto (o bundle
  e fechado); esse dump e o que permite tipar o resto a partir do que o engine
  realmente entrega, em vez de assumir nomes.

O overlay e opcional: se `DiagnosticsOverlay.isEnabled()` for falso, o manager
recebe `null` e nao chama nada.

## 6. `src/main.ts` — fiacao

- Remover `cardDeckSystem.startRegeneration()` (linha ~161) — passa ao `GameFlow`.
- Remover `installImmersiveModeOnGesture(...)` do `bootstrap()` (linha ~232) —
  passa ao `GameFlow`, que agora sabe o modo escolhido. Hoje ele dispara no
  primeiro `pointerdown`, que e o toque do proprio menu.
- Instanciar, depois do `CombatEngine`: `DiagnosticsOverlay` (se habilitado),
  `StartScreen`, `GameFlow`; chamar `gameFlow.start()`.
- Passar o `DiagnosticsOverlay` ao `EighthWallARManager` (parametro opcional do
  construtor).
- Ligar `startScreen.setArAvailable(arManager.isARAvailable())` — como o engine
  carrega de forma assincrona, reavaliar quando ele ficar pronto (o manager ja
  chama `updateUI()` em `markXR8Ready`; use um observable ou callback, nao
  polling).
- Acrescentar `gameFlow`, `startScreen` e `diagnosticsOverlay` a cadeia de
  `scene.onDisposeObservable` (linha ~176).

## 7. Limpeza e documentacao

- Apagar `src/ui/ToggleSwitch.ts` — sem consumidor desde o SPEC-00. Conferir com
  `grep -r ToggleSwitch src/` antes.
- `README.md`: atualizar "Estado Atual" (calibracao de escala absoluta
  obrigatoria antes de ancorar; menu inicial de escolha de modo; politica de
  orientacao por modo) e marcar o menu inicial da fase 04 do roadmap como
  parcialmente entregue. Ajustar a secao "Tela cheia e orientacao", que hoje
  descreve a trava de paisagem como politica global.

## Criterios de aceite

- [ ] `npx tsc --noEmit`, `npm run test` e `npm run build` passam.
- [ ] `npm run dev` no desktop: abre no menu, sem arena/cartas/cogumelos; "Jogar em RA" esmaecido; "Jogar na tela" inicia a partida e so entao os cogumelos comecam a regenerar.
- [ ] `grep -rn "ToggleSwitch" src/` nao retorna nada.
- [ ] Entrar e sair da RA duas vezes nao acumula pipeline modules (conferir por log de `addCameraPipelineModule`).
- [ ] `HITTEST_SAFE_STATUSES` e `["NORMAL"]` e o comentario acima dele descreve o comportamento real.

## Verificacao

```bash
npx tsc --noEmit && npm run test && npm run build
```

Validacao funcional so em device (`https://<ip>:5173`) — o SLAM nao roda no
desktop. Roteiro na secao "Verificacao" do plano; o ponto central e: **com o
celular parado o reticle nao pode aparecer e o toque nao pode ancorar**, e o
overlay "Mova o celular para frente e para tras" tem que sumir sozinho ao chegar
em `NORMAL`.
