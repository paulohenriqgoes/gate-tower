# Arena 180 — quadro de estado

**Este arquivo e a unica fonte de verdade sobre o que esta pronto e o que falta
na v3.** Se outro documento do repositorio afirmar estado de uma etapa, ele esta
desatualizado e o certo e o que esta aqui.

Ultima reconciliacao contra o codigo: **2026-08-19**.

## Para que serve, e o que NAO mora aqui

O projeto tinha o estado da v3 espalhado por quatro documentos que discordavam
entre si, e toda sessao comecava reconciliando os quatro contra o codigo. Este
diretorio existe para acabar com isso. A divisao de trabalho e:

| Onde | O que registra | Tempo verbal |
| --- | --- | --- |
| `docs/specs-arena-180/` (aqui) | o que fazer, com que contrato, e em que pe esta | presente e futuro |
| [`docs/experimentos/arena-180-atencao.md`](../experimentos/arena-180-atencao.md) | o que cada tentativa **provou**, inclusive as conclusoes revogadas | passado |
| [`README.md`](../../README.md) | porta de entrada do projeto | nao duplica nenhum dos dois |
| [`docs/guias/tower_gate_spec_v3.md`](../guias/tower_gate_spec_v3.md) e o [storyboard](../guias/tower_gate_storyboard.html) | o que o jogo **e** — design, nao execucao | atemporal |

Duas regras que mantem isso verdadeiro ao longo do tempo:

1. **Estado mora so neste arquivo.** Nenhuma spec deste diretorio diz se esta
   pronta. A spec diz *o que fazer*; o quadro diz *em que pe esta*. Assim nao
   existem dois lugares para divergir.
2. **Spec fechada some.** Quando uma unidade e concluida ou superada, o arquivo
   de spec dela e removido e ela vira uma linha no quadro, apontando para o
   commit e para a entrada do diario. Historico e trabalho do diario.

## Vocabulario de estado

Fechado em seis valores. Nao invente um setimo.

| Estado | Significa |
| --- | --- |
| `ABERTA` | nada escrito em `src/` |
| `PARCIAL` | parte do codigo existe; o quadro nomeia o que falta |
| `IMPLEMENTADA` | codigo + teste + build passando; **nunca foi a device** |
| `EM DEVICE` | rodou em device; o criterio de aceite ainda nao foi cumprido |
| `VALIDADA` | criterio de aceite cumprido, com evidencia citada e **quem testou** nomeado |
| `SUPERADA` | morta por decisao posterior, com ponteiro para o que a substituiu |

**Nada vira `VALIDADA` sem device** — e a regra 1 da skill `encerrar-sessao`, e
ela governa esta coluna. A evidencia precisa nomear quem testou: o projeto ja
registra, duas vezes, que o autor testando o proprio jogo nao vale como leitura
da metrica.

Uma unidade cujo criterio de aceite e verificavel sem hardware (logica pura,
edicao de documento) pode ir a `VALIDADA` pelo comando que a verifica — o quadro
diz qual em cada caso.

## Quadro

### Trilha RA — a fundacao (prefixo `RA-`)

| Unidade | Nome | Estado | Evidencia / o que falta |
| --- | --- | --- | --- |
| RA-F2 | a arena vive na origem; o piso e declarado | `EM DEVICE` | `066a5d7`. Partida completa jogada e **vencida** em device 2026-08-19 (Android/Chrome, testada pelo autor), telemetria `tower-gate-sessao-1787184130010.json`: `arena_placed` NORMAL aos 33,1 s, `match_ended` win aos 128,7 s, zero `tracking_lost`. **Falta** o criterio de cinco entradas em RA — a segunda trava (ver RA-F5) |
| RA-F3 | a altura do jogador e `origin.y` | `ABERTA` | — |
| RA-F4 | `recenter()` e a colocacao | `ABERTA` | — |
| RA-F5 | segunda sessao via `reconfigureSession` | `ABERTA` | A API existe no bundle (`public/8thwall/xr.js`). **E o gargalo de toda validacao seguinte**: sem ela cada teste em device custa um recarregamento de pagina |
| RA-F6 | adotar o que o `xrextras` ja resolve | `ABERTA` | — |
| RA-F7.a | dois erros ativos na skill de RA | `VALIDADA` | `9ba9e7a`. Criterio e `grep` no arquivo da skill, e ele passa — `imageTargets` e `recenterWithOrigin` sairam |
| RA-F7.b | reescrever as skills a partir da API | `ABERTA` | `ar-xr-8thwall.md` ainda ensina fit de piso por `hitTest`, que a RA-F2 removeu do projeto |

### Trilha do jogo (prefixo `JG-`)

| Unidade | Nome | Estado | Evidencia / o que falta |
| --- | --- | --- | --- |
| JG-01 | `ArenaArc`: o modelo polar puro | `VALIDADA` | `96c364e`. O criterio de aceite e a suite (`ArenaArc.test.ts`), e ela passa. Sem import de `@babylonjs/*` |
| JG-02 | escala de sala: 1 unidade = 1 metro | `IMPLEMENTADA` | `96c364e`. `AR_ARENA_SCALE` nao existe mais; `src/arena/metrics.ts` e a fonte de tamanho. **Falta o device**: o fade de proximidade a menos de 0,6 m nunca foi visto em RA |
| JG-03 | ancoragem egocentrica | `SUPERADA` | Por **RA-F2**. Nao existe mais ancoragem: a arena e autorada na origem e nunca se move, entao nao ha posicao para ancorar. `ArenaAnchor`, `closeArenaAtPlayer` e o gate de colocacao sairam do projeto |
| JG-04 | diretor de ondas e convergencia ao jogador | `PARCIAL` | `src/battle/WaveDirector.ts` e o teste dele **existem e estao orfaos** — nenhum arquivo os importa. **Falta**: fiar no `CombatEngine`, reescreve-lo para alvo-unico-jogador com navegacao radial, e remover `EnemyScript` e `DeploymentZone`, que continuam sendo o caminho vivo |
| JG-05 | alertas de flanco e audio espacial | `ABERTA` | `FlankAlert`, `visibilityRaycast` e `SpatialCues` nao existem. O projeto continua **sem modulo de audio** |
| JG-06 | colocacao direta no chao | `ABERTA` | `PlacementRing` nao existe |
| JG-07 | cartas presas ao jogador; o HUD 2D morre | `ABERTA` | `HandCards3D` nao existe; `CardDeckHud.ts` continua vivo |
| JG-08 | caldeirao fermentador | `ABERTA` | Nao existe `src/world/` |
| JG-09 | economia de cartas: derrotado vira carta | `ABERTA` | `CardAlbum` e `CardStock` nao existem |
| JG-10 | a intro: o gatilho e enquadrar | `ABERTA` | `FramingTrigger` e `FloorCrack` nao existem; `ProximityTrigger` continua sendo o gatilho. `GamePhase` tem 5 fases e esta etapa pede 7 |
| JG-11 | fim de partida e album | `ABERTA` | `AlbumScreen` nao existe. **O escopo encolheu**: a tarefa do ciclo de vida da sessao de RA migrou para RA-F5 |

### Verificar com

Todo estado acima e falsificavel. Rode este bloco inteiro da raiz do repositorio
e confira contra a coluna `Estado` — se divergir, o quadro e que esta errado.

```bash
# a suite nao se move enquanto so documentacao muda: 180 testes, 16 arquivos
npx tsc --noEmit && npm run test

# RA-F2 e RA-F7.a commitadas
git log --oneline | grep -E "066a5d7|9ba9e7a"

# RA-F3, RA-F4, RA-F5 ABERTA: nenhuma das tres APIs aparece no codigo
grep -rn "setPlayerHeight\|XrController.recenter\|reconfigureSession" src/

# RA-F5 e viavel: a API existe no bundle
grep -c "reconfigureSession" public/8thwall/xr.js

# RA-F6 ABERTA
grep -c "xrextras" package.json

# RA-F7.b ABERTA: a skill ainda ensina o pipeline removido
grep -n "hitTest" .claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md

# JG-02 IMPLEMENTADA: a escala autoral morreu
grep -rn "AR_ARENA_SCALE" src/

# JG-03 SUPERADA: nao ha mais medicao de piso nem gate
ls src/ar/placementGate.ts src/ar/floorEstimate.ts src/ar/hitTestSampling.ts 2>&1

# JG-04 PARCIAL: o WaveDirector esta orfao, e o caminho antigo esta vivo
grep -rn "WaveDirector" src --include="*.ts" | grep -v src/battle/WaveDirector
grep -rn "EnemyScript\|DeploymentZone" src --include="*.ts" | grep -v "src/battle/EnemyScript\|src/combat/DeploymentZone"

# JG-05 a JG-11 ABERTA: nenhum dos modulos previstos existe
ls src/ui/FlankAlert.ts src/fx/visibilityRaycast.ts src/audio/ src/interaction/PlacementRing.ts \
   src/ui/HandCards3D.ts src/world/ src/cards/CardAlbum.ts src/cards/CardStock.ts \
   src/towers/FramingTrigger.ts src/fx/FloorCrack.ts src/ui/AlbumScreen.ts 2>&1

# JG-10 ABERTA: GamePhase ainda tem 5 fases
grep -n "GamePhase" src/game/GameTypes.ts
```

Os greps das unidades `ABERTA` devem sair **vazios**; os `ls` devem dizer que o
arquivo nao existe.

## Invariantes

Valem para **todas** as unidades e por isso nao se repetem em cada spec. Quebrar
um destes nao e trade-off; e regressao.

1. **A logica de jogo e independente do modo de renderizacao**
   (`.github/copilot-instructions.md` §2). O modelo polar recebe `cameraYawDeg`
   como argumento e **nunca** le a camera do Babylon por dentro. E isso que
   mantem o modo tela jogavel, com o jogador simulado no vertice do arco — e o
   modo tela e a validacao barata de tudo que nao depende de RA.
2. **Arquitetura modular obrigatoria:** AR Manager, Arena System, Unit Factory,
   Combat Engine, HUD. Modulo novo entra debaixo de um destes ou se justifica
   como modulo nomeado (`world/`, `audio/`).
3. **Logica pura testavel fora do engine.** A suite roda sem Babylon. Toda regra
   nova de arena, onda, economia e fermentacao nasce em arquivo puro com
   `.test.ts` ao lado.
4. **Nada de shadow map.** Grounding e blob de contato (`src/fx/contactShadow.ts`)
   — a razao vale ainda mais com objetos de 1,20 m.
5. **`DynamicTexture.update()`, nunca `update(false)`.** O `false` sobrevive em
   arte simetrica e so denuncia no primeiro texto desenhado.
6. **UI nova entra na textura compartilhada** via `hud.getTexture()`. Nunca crie
   outra `AdvancedDynamicTexture` fullscreen.
7. **Nada de RA se valida no desktop.** O SLAM so roda no celular. Codigo que
   apenas compilou se escreve "implementado, nao testado em device" — nunca
   "funciona".

### Dois invariantes antigos que MORRERAM, e por que

O plano original carregava mais dois, e eles descreviam um pipeline que a RA-F2
removeu do projeto. Nao os reintroduza por habito:

- ~~"`hitTest` so com `trackingStatus === NORMAL`, sempre em `try/catch`, e
  normalizado por px CSS"~~ — continua **tecnicamente correto**, mas `hitTest`
  saiu do caminho critico. O piso e declarado, nao medido. Vale so para quem for
  usar `hitTest` como consulta pontual de geometria;
- ~~"o gate de RA recusa por prova contraria, nunca por falta de prova"~~ — **nao
  ha mais gate neste projeto**. Com o piso declarado nao existe o que reprovar.

O aprendizado que os produziu — **silencio de sensor nao e evidencia**; um gate
por prova positiva recusou 79 toques sem ancorar uma vez — nao morreu junto. Ele
esta na lista do que tem de sobreviver a reescrita das skills, em
[RA-F7.b](RA-F7b-skills-de-ra.md).

## Limites do stack que nenhuma unidade resolve

Nao sao trabalho pendente. Sao propriedades do stack, e desenhar contra elas e
perda de tempo.

- **Oclusao real nao existe** neste stack (spec v3 §11). A oclusao da JG-05 e
  **geometrica contra a torre virtual**, nunca contra moveis reais. O binario nao
  tem meshing de sala, depth, nem classificacao de superficie.
- **Salto de relocalizacao do SLAM e mitigavel, nunca eliminavel** — o binario nao
  expoe anchor persistente por objeto. Ficar parado e a maior mitigacao
  disponivel, e a v3 nao pede deslocamento, entao ela e de graca.
- **VPS esta fora.** `enableVps: true` emite
  `console.error("[XR] VPS is not supported in standalone mode.")`. Os eventos
  `mesh*` pertencem a esse caminho e nao servem aqui.
- **Os numeros de tuning** (raio, custo, ritmo de fermentacao, valor do cogumelo
  verde) entram como constante nomeada em `src/arena/metrics.ts` e
  `src/arena/ArenaArc.ts`, para serem trocados sem refatorar. **Nenhum deles e
  decidido por spec** — so por playtest.

## Ondas

A ordem esta **fixada**, e nao e para ser re-decidida a cada sessao. Se a ordem
mudar, mude aqui e escreva o motivo.

```
Onda A (serial + device):  RA-F5    — destrava a 2a sessao de RA
Onda B (serial):           RA-F3 -> RA-F4
Onda C (device):           validar RA-F3 e RA-F4, e fechar o criterio de
                                    cinco entradas da RA-F2
Onda D (serial):           JG-04    — fiar o WaveDirector, reescrever o CombatEngine
Onda E (paralelo):         JG-05 . JG-06
Onda F (serial):           JG-07
Onda G (device, CORTE):    validacao da tese, com alguem que nao conhece o jogo
Onda H (paralelo):         JG-08 . JG-09
Onda I (serial):           JG-10 -> JG-11
```

**Por que RA-F5 vem primeiro, contra a ordem original da spec 08** (que a punha
na Onda 5): o device de 2026-08-19 mostrou que ela e o gargalo de *toda*
validacao seguinte. Sem segunda sessao nao da para cumprir o criterio de aceite
da propria RA-F2, e cada teste de qualquer outra etapa custa um recarregamento
de pagina inteiro.

**Por que a Onda B e serial:** RA-F3 e RA-F4 escrevem o mesmo
`src/ar/EighthWallARManager.ts`.

**Por que a Onda F e serial:** `src/ui/HudLayer.ts` e escrito pela JG-05 e
reescrito pela JG-07. Mesma razao na Onda I, com `GameFlow.ts`/`GameTypes.ts`.

**Por que a Onda G e um corte, e nao um marco:** e o criterio que a propria spec
v3 §12 define — *"passos 1-4 provam a tese; se a mecanica de atencao nao for
divertida ali, o resto nao salva"*. Executar as Ondas H e I antes desse veredito
e construir em cima de uma aposta nao verificada.

**RA-F6** e oportunista, nao bloqueante: pode rodar em paralelo com a Onda B
(arquivos disjuntos — `package.json`, `index.html`, `main.ts`). **RA-F7.b** fica
depois da Onda C, porque o que a skill vai afirmar sobre ancoragem precisa ter
sido visto funcionando.

Validacao em device e **serial por natureza** — e por isso que as ondas C e G
existem como paradas, e nao como coisa que roda junto com codigo.

## Como ler "Etapa N" em comentario de codigo

Cuidado, porque isto ja custou tempo: **"Etapa N" em `src/` quase sempre NAO e a
v3.** Ha tres numeracoes vivas no repositorio.

| O que voce le | O que significa |
| --- | --- |
| "Etapa N" na maioria dos comentarios de `src/` | o plano antigo **table-scale**. Ex.: `TatuBola.ts:27` "Etapa 9" fala de criaturas; `ArenaSystem.ts:113` "Etapa 11" fala de dissolucao; `main.ts:400` "Etapa 6" fala da metade do jogador |
| "Etapa N" citando o arquivo do plano | a **v3**. Unica ocorrencia hoje: `WaveDirector.ts:7`, que cita `tower_gate_v3_plano_etapas.md` |
| "F2".."F7", "spec 08" | a fundacao de RA, hoje `RA-F2`..`RA-F7` |

**Comentario novo usa o prefixo deste diretorio** — `JG-04`, `RA-F5` — e nunca
"Etapa N" solto. Os ~40 comentarios antigos ficam como estao: reescreve-los seria
churn sem ganho, e esta tabela resolve a leitura.

A mesma colisao existia nas decisoes de design: `D1` significava duas coisas
diferentes em dois documentos. Elas foram prefixadas em
[`decisoes.md`](decisoes.md) — `DR-*` para RA, `DJ-*` para o jogo.

## Como manter

Quem atualiza este quadro e a skill `encerrar-sessao`, na **Fase 3**, antes de
tocar no `README.md`. O procedimento e:

1. para cada unidade que a sessao tocou, mudar o `Estado`, a evidencia e — se
   necessario — o comando que a verifica;
2. se uma unidade fechou (`VALIDADA` ou `SUPERADA`), **apagar o arquivo de spec
   dela** e deixar so a linha do quadro, apontando para o commit e para a entrada
   do diario;
3. so entao atualizar o `README.md`, **sem repetir este quadro**.

Uma linha de estado sem comando de verificacao e opiniao, nao estado. Se voce nao
souber escrever o comando, o estado provavelmente nao esta claro o bastante.
