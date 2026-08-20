# RA-F5 — Segunda sessao de RA via `reconfigureSession`

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

**A causa suspeita** e o `XR8.clearCameraPipelineModules()` que o `detach` do
`xrCameraBehavior` executa: ele limpa tambem os modulos do app (o de status e o
do coaching overlay), e nada os re-adiciona de forma que volte a rodar. Isso e
**consistente** com o sintoma, mas **nao esta provado**.

**Uma hipotese anterior esta REFUTADA — nao a persiga.** O README e o diario ja
afirmaram que "o projeto nunca chama `XR8.run()` nem `XR8.stop()`". Lido no
bundle: o `xrCameraBehavior` chama **os dois**. O `attach` termina em
`XR8.run({ canvas, ownRunLoop: false, ... })` e o `detach` faz `XR8.stop()` +
`XR8.clearCameraPipelineModules()`. Quem seguir aquela pista procura no lugar
errado.

O que `exitAR()` (`:574-622`) faz hoje: remove o modulo de status por nome,
desanexa o coaching overlay, remove o behavior, descarta a `arCamera`, restaura
`scene.autoClear` e a camera anterior. Nada disso re-inicializa o engine.

## Arquivos-alvo

`src/ar/EighthWallARManager.ts`, `src/ar/coachingOverlay.ts`,
`src/types/xr8.d.ts` (declarar `reconfigureSession`, hoje ausente da tipagem).

## Contrato

**Antes de trocar qualquer API, instrumente.** Logar `onAttach`, `onDetach` e
`onStart` do modulo de status e observar quais disparam na segunda entrada. E o
que transforma a suspeita acima em causa provada, em vez de trocar a API e
torcer. Se o `onAttach` disparar e o `onStart` nao, a leitura muda.

`XR8.reconfigureSession({ runConfig })` existe no bundle
(`public/8thwall/xr.js`) e e o que o `packages/xrextras/src/sessionreconfiguremodule/`
usa. No bundle ela faz: detach, pause, stop, `Object.assign(config)` e re-init.

Adicione a assinatura em `src/types/xr8.d.ts` junto de `stop`, com o mesmo
cuidado de comentario que `updateCameraProjectionMatrix` ja carrega: o que esta
na doc publica e o que foi lido do bundle.

## Criterio de aceite

Entrar em RA, sair, entrar de novo — a arena aparece na segunda sessao **sem
recarregar a pagina**, com coaching overlay e com o tracking convergindo. Feito
isso, o criterio de aceite da RA-F2 (cinco entradas seguidas, arena no chao nas
cinco) passa a ser cumprivel, e cumpri-lo faz parte desta unidade.

## Como validar

`npx tsc --noEmit && npm run test`, e device: cinco ciclos entra/sai numa unica
carga de pagina, com `?debug=1` mostrando `trackingStatus` em cada entrada.

## Fora de escopo

Altura ajustavel (RA-F3); `recenter` (RA-F4); adocao do `xrextras` (RA-F6) — ela
tem um `SessionReconfigureModule` pronto, mas adota-lo aqui misturaria duas
mudancas de ciclo de vida numa validacao so.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| Instrumentar o ciclo de vida e ler em device | execucao direta | `opus` — e a etapa que decide se a suspeita esta certa; ler errado aqui manda a correcao para o lugar errado | — |
| Trocar o ciclo de vida por `reconfigureSession` | execucao direta | `opus` — causa-raiz de um bloqueador antigo, no modulo mais sensivel do projeto | — |

## Depende de

Nenhuma. A RA-F2 ja esta no codigo.
