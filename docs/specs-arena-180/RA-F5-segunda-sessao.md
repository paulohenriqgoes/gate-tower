# RA-F5 — Segunda sessao de RA

> **Correcao de 2026-08-20: o titulo desta spec estava errado, e o contrato dela
> tambem.** `reconfigureSession` **nao reabre sessao** — lida em
> `public/8thwall/xr.js`, ela comeca com
> `if (!i) throw new Error("[XR8] Cannot reinitialize session at this time.")`,
> onde `i` e o flag de sessao inicializada, e portanto **lanca** depois de
> `XR8.stop()`. Nem redispara `onStart`. Ela serve para trocar `runConfig` numa
> sessao viva (camera frontal/traseira), que e o que o `SessionReconfigureModule`
> do `xrextras` faz com ela.
>
> A causa lida no codigo e outra, e esta na secao "Contrato" abaixo, reescrita.
> O raciocinio inteiro esta na entrada de 2026-08-20 do
> [diario](../experimentos/arena-180-atencao.md) e na hipotese 6 de la.

**Objetivo:** entrar em RA, sair e entrar de novo sem recarregar a pagina.

**Por que vem primeiro:** e o gargalo de toda validacao seguinte. Sem segunda
sessao nao da para cumprir o criterio de aceite da RA-F2 (cinco entradas), e cada
teste de qualquer outra unidade custa um recarregamento de pagina inteiro. A
ordem original da spec 08 punha esta etapa na Onda 5; o device de 2026-08-19
mostrou que ela tem de vir antes.

Na v3 isso deixou de ser obstaculo de metodologia e virou obstaculo de produto: o
Ato 4 do storyboard termina em "jogar de novo", e o album entre partidas exige
sair da partida e voltar.

## Ponto de partida

O sintoma foi observado **por inteiro** em device (2026-08-19): depois de vencer
uma partida, "jogar novamente" percorre `match-over -> menu -> escolher RA`, e na
segunda entrada **so o loader gira — sem coaching overlay e sem arena**. O
overlay funciona normalmente na PRIMEIRA entrada, o que isola o defeito no ciclo
de vida da sessao.

**O mecanismo do sintoma esta lido no codigo, e nao e a causa:**

- `src/game/GameFlow.ts:597-600` — `setPhase("menu")` chama `arManager.exitAR()`;
- `src/ar/EighthWallARManager.ts:316` — `refreshPlacementOverlay()` mantem o
  loader visivel enquanto `latestTrackingStatus === null`;
- numa segunda sessao o `onUpdate` do pipeline nunca chega, entao
  `latestTrackingStatus` nunca sai de `null` e o loader gira para sempre.

**A causa suspeita ate 2026-08-19** era o `XR8.clearCameraPipelineModules()` que
o `detach` do `xrCameraBehavior` executa. Ela **enfraqueceu**: o `clear` existe e
faz isso, mas o `enterAR` seguinte re-adiciona os dois modulos, entao ele e
simetrico.

**A causa lida no codigo em 2026-08-20** e o `attach` do `xrCameraBehavior`, que
registra `Q.onBeforeRenderObservable.add(...)` e `Q.onAfterRenderObservable.add(...)`
a cada chamada — com o `Observer` devolvido descartado — enquanto o `detach` e so
`XR8.stop()` + `XR8.clearCameraPipelineModules()`, sem remover nenhum dos dois.
Como `XR8.Babylonjs` sai de uma fabrica chamada UMA vez (`Babylonjs: mQ()`), a
cena e sempre a mesma, e a enesima entrada dirige `runPreRender`/`runRender`/
`runPostRender` **N vezes por frame**, com `process-gpu` e liberacao de textura
rodando uma vez so.

Isso explica os DOIS sintomas de uma vez: o coaching overlay so aparece por
evento `reality.trackingstatus`, que nasce do pipeline — "sem overlay" e "sem
arena" sao a mesma ausencia de frame. **Continua sem prova em device**, e e para
isso que serve a instrumentacao abaixo.

**Uma hipotese anterior esta REFUTADA — nao a persiga.** O README e o diario ja
afirmaram que "o projeto nunca chama `XR8.run()` nem `XR8.stop()`". Lido no
bundle: o `xrCameraBehavior` chama **os dois**. O `attach` termina em
`XR8.run({ canvas, ownRunLoop: false, ... })` e o `detach` faz `XR8.stop()` +
`XR8.clearCameraPipelineModules()`. Quem seguir aquela pista procura no lugar
errado.

O que `exitAR()` fazia ate 2026-08-20: removia o modulo de status por nome,
desanexava o coaching overlay, removia o behavior, **descartava a `arCamera`** e
restaurava `scene.autoClear` e a camera anterior. Os dois pontos em negrito
viraram os itens 2 e 3 do contrato.

## Arquivos-alvo

`src/ar/EighthWallARManager.ts`, `src/ar/coachingOverlay.ts`,
`src/types/xr8.d.ts`, e `src/ar/observerLeak.ts` (o diff de observers, com o
mecanismo do vazamento documentado).

## Contrato

**Antes de trocar qualquer API, instrumente.** Logar `onAttach`, `onDetach` e
`onStart` do modulo de status e observar quais disparam na segunda entrada. E o
que transforma a suspeita acima em causa provada, em vez de trocar a API e
torcer. Se o `onAttach` disparar e o `onStart` nao, a leitura muda.

O ciclo continua sendo `XR8.run()` (pelo attach do behavior) e `XR8.stop()`
(pelo detach). O que muda e tornar esse ciclo **idempotente**, consertando os
tres pedacos de estado que o 8th Wall carrega entre sessoes:

1. **os observers de render vazados** — capture-os comparando
   `scene.onBeforeRenderObservable.observers` antes e depois do attach (o
   `addBehavior(behavior, true)` torna a comparacao exata, porque anexa no mesmo
   tick) e remova-os no `exitAR`;
2. **a camera** — reuse UMA `FreeCamera` por toda a vida do manager. O modulo
   `babylonjsrenderer` guarda as intrinsics num fechamento que sobrevive ao
   `stop()` e so chama `freezeProjectionMatrix` quando elas mudam; camera nova
   nunca receberia a matriz de projecao do device. Reusando, zere a pose antes
   de cada attach — o `onAttach` dele le `camera.position`/`rotationQuaternion`
   para declarar a origem, e o faz DEPOIS do `onStart`;
3. **a ordem do teardown** — desanexe o behavior PRIMEIRO e deixe o
   `clearCameraPipelineModules()` dele remover os modulos do app. Removendo-os
   antes, o `onDetach` deles nunca dispara, e ele e a marca que diz se a sessao
   chegou a subir.

Declare `reconfigureSession` em `src/types/xr8.d.ts` junto de `stop`, com o
comentario dizendo o que ela **nao** faz — para ninguem reabrir o bundle e
refazer a descoberta.

## Criterio de aceite

Entrar em RA, sair, entrar de novo — a arena aparece na segunda sessao **sem
recarregar a pagina**, com coaching overlay e com o tracking convergindo. Feito
isso, o criterio de aceite da RA-F2 (cinco entradas seguidas, arena no chao nas
cinco) passa a ser cumprivel, e cumpri-lo faz parte desta unidade.

## Como validar

`npx tsc --noEmit && npm run test`, e device: cinco ciclos entra/sai numa unica
carga de pagina, com `?debug=1` aberto. Tres campos do painel decidem a leitura:

- **`lifecycle`** — `s2 enter>attach>start>update` diz que o pipeline entrega
  frame na segunda sessao; parar em `start`, sem `update`, confirma o mecanismo
  do vazamento de observers;
- **`xr8Observers`** — precisa dizer `2` em toda entrada. Outro numero significa
  que a captura errou o alvo e o `exitAR` nao esta removendo nada;
- **`trackingStatus`** — convergindo para `NORMAL` em cada uma das cinco.

## Fora de escopo

Altura ajustavel (RA-F3); `recenter` (RA-F4); adocao do `xrextras` (RA-F6) — ela
tem um `SessionReconfigureModule` pronto, mas adota-lo aqui misturaria duas
mudancas de ciclo de vida numa validacao so.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| Instrumentar o ciclo de vida e ler em device | execucao direta | `opus` — e a etapa que decide se a suspeita esta certa; ler errado aqui manda a correcao para o lugar errado | — |
| Tornar o ciclo `run`/`stop` idempotente | execucao direta | `opus` — causa-raiz de um bloqueador antigo, no modulo mais sensivel do projeto | — |

## Depende de

Nenhuma. A RA-F2 ja esta no codigo.
