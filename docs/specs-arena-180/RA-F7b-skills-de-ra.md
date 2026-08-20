# RA-F7.b — Reescrever as skills a partir da API, nao da cicatriz

**Objetivo:** as skills de RA deixam de ensinar a **medir** o piso e passam a
ensinar a **declara-lo**. Este e um objetivo declarado do projeto: produzir
skills que permitam construir jogos de RA com 8th Wall + Babylon sem cair nas
armadilhas que este projeto ja pagou.

## Ponto de partida

- `grep -c "hitTest" .claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md`
  devolve **9** — a skill ainda ensina fit de piso por `hitTest`, um pipeline que
  a RA-F2 removeu inteiro do projeto;
- **ja existe e esta pronto**:
  `.claude/skills/babylonjs-game-dev/references/8thwall-api-surface.md`, 854
  linhas com **procedencia por simbolo** (o que veio do bundle, o que veio da
  doc). E o insumo desta reescrita;
- a **RA-F7.a ja saiu** (`9ba9e7a`): as duas chamadas mortas (`imageTargets`
  no-op e `recenterWithOrigin` inexistente) foram corrigidas. O que sobra e a
  reescrita estrutural.

## Arquivos-alvo

`.claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md` (reescrita),
`.claude/skills/babylonjs-game-dev/references/8thwall-anchoring.md` (novo),
`.claude/skills/babylonjs-game-dev/SKILL.md` (indice).

## Contrato

`8thwall-anchoring.md` abre com **a escolha de referencial** como a primeira
decisao de um jogo de RA: conteudo autorado na origem versus posicionado por
medicao. `recenter()` entra como **primitiva de colocacao**; image target entra
como a resposta certa para outra classe de problema; `hitTest` e **rebaixado a
consulta pontual sobre geometria**, nunca fundacao de grounding.

Entra o **mapa honesto do que o binario nao tem**: meshing de sala, depth,
oclusao, classificacao de superficie, anchor persistente. Os eventos `mesh*` sao
do caminho VPS/wayspot, e `enableVps: true` emite
`console.error("[XR] VPS is not supported in standalone mode.")` — VPS esta fora.

Entram os tres bugs que a spec 08 encontrou: ordem de carregamento do
`window.BABYLON`, ramo destro do modulo Babylon quebrado (quaternion NaN), e o
par sinal/zero do azimute.

### O CICLO DE VIDA da sessao, que hoje a skill ensina errado (achado de 2026-08-20)

Esta secao e nova e vale por si so: a skill hoje diz, na linha 82, que o `exit()`
do estado de RA "deve parar o `XR8.run()`/pausar o pipeline alem de chamar
`scene.dispose()`" — e quem seguir isso escreve **exatamente** o bug que a RA-F5
passou tres sessoes perseguindo. O que falta ensinar:

- **o `xrCameraBehavior` do Babylon ja chama `XR8.run()` e `XR8.stop()` por
  voce.** O `attach` termina em `XR8.run({canvas, ownRunLoop:false, ...})`; o
  `detach` faz `XR8.stop()` + `XR8.clearCameraPipelineModules()`. Chamar de novo
  por fora e o erro;
- **o `attach` vaza dois observers de render e o `detach` nao os remove.** Ele
  faz `scene.onBeforeRenderObservable.add(...)` e `onAfterRenderObservable.add(...)`
  a cada chamada, com o `Observer` devolvido descartado. Como `XR8.Babylonjs` sai
  de uma fabrica chamada UMA vez, a cena e a mesma sempre, e a enesima sessao
  dirige o pipeline N vezes por frame. **Quem escreve entra/sai de RA em Babylon
  precisa remover esses dois observers na mao**;
- **nao descarte a camera de RA entre sessoes.** O modulo `babylonjsrenderer`
  guarda as intrinsics num fechamento que sobrevive ao `stop()` e so chama
  `freezeProjectionMatrix` quando elas MUDAM — camera nova recebe o campo de
  visao padrao do Babylon, desalinhado do feed;
- **`reconfigureSession` NAO reabre sessao.** Ela lanca quando a sessao nao esta
  inicializada, ou seja depois de `XR8.stop()`, e nao redispara `onStart`. Serve
  para trocar `runConfig` numa sessao viva. Este erro esta escrito em tutorial e
  custou o contrato inteiro de uma spec deste projeto;
- **a pose da camera antes do attach e quem declara a origem, nao a sua chamada.**
  O engine dispara `onStart` e SO DEPOIS o `onAttach` do modulo Babylon, que
  chama `updateCameraProjectionMatrix({origin: camera.position, facing:
  camera.rotationQuaternion})`. Declarar a origem no `onStart` e correto, mas
  quem tem a ultima palavra e a pose.

**Confirmados em device em 2026-08-20** (Android/Chrome), menos onde dito o
contrario: o vazamento de observers era mesmo a causa (a 2a sessao passou a
subir), a ordem real e `enter>start>attach>update` — `onStart` ANTES de
`onAttach` — e o `detach>remove` so aparece com o teardown na ordem certa.

### A CORRECAO MAIS IMPORTANTE DA REESCRITA: "declarar o piso" tem um limite

A skill vai ensinar que o piso e **declarado** e nao medido. Isso continua
verdade, mas a versao ingenua da frase — "ponha `origin.y` na altura do jogador
e o chao cai em `y = 0`" — **e falsa em escala absoluta**, e este projeto acreditou
nela por um mes.

Medido em device em 2026-08-20: com `scale: "absolute"`,
`updateCameraProjectionMatrix` copia a origem recebida, guarda o ponto de
`recenter()` com ela, e **entao faz `P.y = 1`**. Quatro colocacoes com 1,55
declarado deram distancia camera-origem de **1,0049 / 0,9797 / 1,0134 / 1,0043**.

O que a skill precisa dizer, em vez da frase ingenua:

- em escala **absoluta**, o engine assume o dispositivo a **1 m do chao** no
  instante da colocacao, e ignora o `origin.y` declarado. Quem define o piso e
  **a altura em que a pessoa segura o celular no gesto**, nao um numero no codigo;
- o `origin.y` declarado **nao e inutil**: ele ainda alimenta o ponto de
  `recenter()` (`updateRecenterPoint`, default `true`) e, em escala
  **responsiva**, ele vira a propria escala do mundo (`d = P.y`);
- a guarda contra valor nao-finito continua obrigatoria em qualquer modo:
  `origin` com NaN contamina o frame do engine de forma permanente.

### O que TEM de sobreviver a reescrita

Nenhum destes esta errado; todos mudam de lugar. Perder qualquer um custa
repetir um ciclo de investigacao ja pago.

- **silencio de sensor nao e evidencia** — gate por prova positiva produziu 79
  recusas e zero ancoragens em dois testes de device;
- **tilt medido nunca aplicado na cena** — a mediana do fit e 13 graus, com picos
  de 48; e ruido, nao geometria;
- **limiar em graus carrega raio implicito** — 12 graus valem 8 cm numa arena de
  80 cm e **47 cm** num arco de 2,2 m de raio. Um limiar angular herdado de outra
  escala e um limiar errado;
- **`hitTest` precoce estoura o WASM** e mata o app; sempre em `try/catch`;
- **normalizacao em px CSS** (`clientWidth`/`clientHeight`), nao em px de device;
- **`FEATURE_POINT` nao se remove** da lista de tipos aceitos — sem ele o
  `hitTest` emudece. Vale mais que o argumento teorico de que feature point nao e
  superficie.

### O item a REBAIXAR, sem apagar e sem promover

**"Esconda o chao virtual opaco em AR"** (hoje na linha 204). E **heuristica do
autor do projeto**, nao achado medido — confirmado por ele em 2026-08-19 — e ha
contra-evidencia: experiencias de mini golf em RA poem o percurso no chao e
funcionam.

O que a medicao sustenta e mais estreito: **linha fina e extensa vista em
incidencia rasante amplifica erro de pose**, por geometria projetiva. E por isso
que julgar ancoragem por um anel deitado a 2,2 m e cruel, e por isso que o spike
passou a usar totens verticais com pe visivel. Mas amplificar o sintoma nao e o
mesmo que proibir conteudo no piso.

Mantenha o texto, marcado como heuristica de origem conhecida e sem medicao, e
ponha ao lado o achado medido — que e sobre **escolha de alvo para diagnosticar
deriva**, nao sobre design de arte.

### A meta-licao, explicita

Skill escrita so a partir da experiencia da sessao **consolida o caminho errado**
se nunca for confrontada com a superficie de API e com o codigo oficial. Foi
exatamente o que aconteceu aqui: o projeto passou semanas melhorando a medicao de
um piso que o engine nunca pediu para medir.

## Criterio de aceite

`grep -n "hitTest" ar-xr-8thwall.md` so devolve ocorrencias no contexto de
"consulta pontual", nunca de grounding. Todos os aprendizados da lista acima
existem no arquivo novo, encontraveis por busca. A meta-licao esta escrita.

## Como validar

Leitura, mais o teste real: pegar a spec 08 e perguntar se alguem que so leu as
skills novas teria caido em algum dos tres bugs. Se sim, falta conteudo.

## Fora de escopo

Diario e `README.md` — isso e trabalho da skill `encerrar-sessao`. O quadro deste
diretorio — quem o atualiza tambem e ela.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| Reescrita e reparticionamento das skills de RA | execucao direta | `opus` — decide o que o projeto vai acreditar sobre RA daqui para frente; erro aqui contamina toda sessao futura | — |
| Atualizar indice e links da `SKILL.md` | `general-purpose` | `haiku` — mecanico, alvo definido pela tarefa acima | — |

## Depende de

A evidencia de device acumulada ate a Onda C do quadro (RA-F2 fechada, RA-F3 e
RA-F4 validadas). O que a skill vai afirmar sobre ancoragem precisa ter sido
visto funcionando, e nao apenas compilado.
