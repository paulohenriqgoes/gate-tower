# RA-F6 — Adotar o que o `xrextras` ja resolve

**Objetivo:** parar de manter a mao codigo que o 8th Wall distribui sob MIT.

## Ponto de partida

`grep -c "xrextras" package.json` devolve **0** — a biblioteca nao esta no
projeto. Enquanto isso, `src/main.ts` tem 719 linhas, e parte delas resolve a mao
exatamente o problema que o `FullWindowCanvas` resolve: dimensionamento de canvas.

A regra atual de resize esta documentada no `README.md` e e sutil o bastante para
merecer cuidado numa troca — `engine.resize()` durante a sessao de RA so acontece
quando o canvas CSS e o tamanho de render divergem alem de 2 px, porque
`engine.resize()` e o **unico** gatilho de `engine.onResizeObservable`, que e onde
o `AdvancedDynamicTexture` de tela cheia recalcula o proprio tamanho. Sem ele, a
textura do HUD congela no tamanho antigo e **os controles aparecem sem responder
ao toque**. Qualquer modulo adotado tem de preservar esse comportamento ou
provar que o substitui.

## Arquivos-alvo

`package.json`, `index.html`, `src/main.ts`, `scripts/copy-8thwall.mjs`.

## Contrato

Avaliar e adotar, um a um: `FullWindowCanvas`, `Loading`, `RuntimeError`,
`LandingPage`.

**Risco declarado:** esses modulos assumem o fluxo de **pipeline modules**, e
neste projeto quem manda no ciclo de vida e o `xrCameraBehavior`. A etapa pode
terminar adotando um **subconjunto** — isso e resultado valido, desde que o
motivo de cada recusa fique registrado no proprio arquivo que a recusa afeta.

`SessionReconfigureModule` fica **fora**: ele e do dominio da RA-F5, que roda
antes e valida a troca de ciclo de vida isolada.

## Criterio de aceite

Cada modulo adotado **remove codigo equivalente** — adotar sem remover e so
somar dependencia. Cada modulo recusado tem o motivo escrito. O
comportamento de resize do HUD continua correto: entrar em RA, girar o aparelho
e tocar num controle, e ele responde.

## Como validar

`npx tsc --noEmit && npm run test && npm run build`, e device: o toque nos
controles do HUD continua funcionando depois de entrar em RA.

## Fora de escopo

Ciclo de vida da sessao (RA-F5). Trocar o `xrCameraBehavior` por pipeline modules
crus — seria refundar a RA de novo, e a RA-F2 ja fez isso este mes.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| Avaliar compatibilidade de cada modulo com o behavior | `general-purpose` | `sonnet` — investigacao com criterio objetivo | — |
| Integrar os modulos aprovados | `general-purpose` | `sonnet` — implementacao dentro do veredito da tarefa acima | — |

## Depende de

Nenhuma. **E oportunista, nao bloqueante:** pode rodar em paralelo com a Onda B
do quadro, porque toca `package.json`, `index.html` e `main.ts`, e as unidades
RA-F3/RA-F4 tocam `EighthWallARManager.ts` e `StartScreen.ts`.
