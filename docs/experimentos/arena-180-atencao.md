# Experimento: arena de 180 graus e atencao como recurso

Diario da v3 do Tower Gate — a reformulacao que existe para responder **uma
pergunta que a demo anterior nao podia responder**: *a RA da para ser mecanica, e
nao cenografia?*

Este arquivo guarda duas coisas, e so elas: o **resumo de cada sessao** (o que
foi feito, o que aquilo provou, o que falhou) e o **progresso de validacao das
hipoteses**. E a memoria do projeto sobre o que ja se sabe e como se soube.

**Nao guarda plano nem estado de etapa.** O que fazer, com que contrato e em que
pe esta cada unidade vive em
[`docs/specs-arena-180/`](../specs-arena-180/README.md). Quando as duas coisas
moravam aqui juntas, elas divergiram — o diario chegou a dizer "sem commit" para
trabalho ja commitado.

Ultima atualizacao: **2026-08-20**.

## Objetivo

O diagnostico que motiva a v3 esta na primeira secao da propria spec
([`tower_gate_spec_v3.md`](../guias/tower_gate_spec_v3.md) §0): no prototipo
atual, travar a camera e trocar por uma camera 3D comum **nao muda o jogo**.
Nada no gameplay depende da pose do dispositivo. A RA e cenario caro.

A v3 aposta em transformar **enquadramento em recurso escasso**: o jogador tem
~60 graus de campo de visao para cobrir um arco de 180 graus, com dois tercos
sempre cegos, e toda acao consome a mesma coisa — para onde o celular esta
apontado. Se isso for divertido, a RA vira mecanica. Se nao for, nenhuma das
outras partes salva.

Tres tensoes que puxam em direcoes opostas:

- **girar 180 graus e a mecanica, e girar 180 graus e o que quebra o SLAM.** A
  spec limita a 180 (e nao 360) exatamente porque virar o corpo tira de cena o
  conjunto de features visuais que o VIO usa, acumulando drift. O jogo pede o
  maximo de rotacao que o tracking aguenta;
- **escala de sala e presenca, e escala de sala amplifica erro.** Uma torre de
  1,20 m obstrui visao e vira criatura em vez de maquete — e 1 grau de erro
  angular a 2,5 m desloca visivelmente a base do objeto;
- **atencao e o recurso, e ler a propria mao tambem custa atencao.** Cartas,
  caldeirao e alertas competem pelo mesmo par de olhos que precisa vigiar tres
  flancos.

## Linha do tempo

> Cada entrada registra o que a sessao **provou**, e vale como estava quando foi
> escrita. Para saber em que pe uma etapa esta **hoje**, nao leia daqui: leia o
> quadro em [`docs/specs-arena-180/README.md`](../specs-arena-180/README.md).

### `066a5d7` — a fundacao de RA em device: a arena assenta, a partida fecha, a segunda sessao nao abre (2026-08-19)

**Feito:** a F2 da [spec 08](../specs/08-fundacao-ar.md) inteira, mais a F7.a. A
arena passou a ser autorada na origem: `arenaRoot` fica em `(0,0,0)` com rotacao
identidade e nada mais escreve nesses campos. O piso deixou de ser medido e
passou a ser declarado — a camera de RA nasce em `(0, 1.55, 0)` e o manager chama
`XR8.XrController.updateCameraProjectionMatrix({ origin, facing })` no `onStart`
do pipeline. O `xr.js` saiu do `index.html` e virou injecao por JS em
`src/ar/xr8Loader.ts`, depois do shim de `window.BABYLON`.

O zero do azimute virou `atan2(x, z)` — e nao so em `arenaHeading.ts`. Ele estava
errado em **quatro** lugares que precisavam concordar: o heading do mundo, o
`toArc`/`toLocal` do `ArenaArc`, o alvo da camera do modo tela e a rotacao das
barras do `ArenaGhost`. Consertar so o primeiro teria deixado a geometria do arco
espelhada contra o heading.

Sairam `placementGate.ts`, `floorEstimate.ts`, `hitTestSampling.ts` e
`poseSmoothing.ts` com seus testes. Balanco: 27 arquivos, 522 linhas adicionadas e
3131 removidas; `EighthWallARManager.ts` foi de 1579 para 882 linhas. `npx tsc
--noEmit` limpo, `npm run build` sem erro, e a contagem de teste caiu de 253 (o
numero que o README registrava) para **180** — queda esperada, nao regressao: o
que morreu testava medicao de piso e suavizacao da pose do preview. *Commitado
depois, em `066a5d7`; a F7.a saiu em `9ba9e7a`.*

**Provou:**

*O piso declarado funciona, e esta e a primeira confirmacao em device da
fundacao.* Com `origin.y = 1,55 m` a arena assentou no chao real, sem `hitTest`,
sem fit de plano e sem gate de colocacao. A pergunta que a spec 07 tentava
responder por dois caminhos nunca precisou ser feita.

*A fundacao aguenta uma partida inteira.* A telemetria exportada
(`tower-gate-sessao-1787184130010.json`) registra a sessao completa:
`arena_placed` com `trackingStatus: NORMAL` aos 33,1 s, `enemy_awakened` aos
97,8 s, tres cartas invocadas, e `match_ended` com `result: win` aos 128,7 s, 100
x 0. Distancia minima da camera ate a arena: 1,25 m. E **nenhum** `tracking_lost`
ou `tracking_recovered` na sessao inteira — o SLAM entrou em `NORMAL` e ficou.

*O JSON prova que a partida rodou sobre o codigo da F2, e nao sobre o anterior.*
O `arena_placed` carrega so `trackingStatus`; `deviceHeightM`, `floorY` e
`tiltDeg` deixaram de existir junto com a medicao que os produzia.

*O zero do azimute esta consertado.* O usuario relatou ver a torre inimiga a
frente ao entrar. Antes da F2 a raiz da arena era girada por `-heading`, e com o
heading 180 graus errado o giro resultante punha a torre do JOGADOR na frente;
com a raiz em identidade e o zero em `+Z`, a frente virou a frente literal.

*O defeito da segunda sessao nao e do coaching overlay nem da nova ordem de
carregamento.* O overlay apareceu e sumiu ao calibrar na PRIMEIRA entrada. Isso
isola o problema no ciclo de vida da sessao — que e exatamente onde a F5 mexe.

*A arena nao cabe no comodo em que foi jogada, e a partida fechou mesmo assim.*
O quarto tem 2,60 x 2,90 m; a arena e autorada com 4,4 x 4,4 m
(`ARENA_WIDTH_METERS`/`ARENA_LENGTH_METERS`, `src/arena/ArenaSystem.ts:28-29`),
que e exatamente o diametro do arco de 2,2 m de raio, com as torres a
`z = +-2,0 m`. Ou seja: a arena e ~1,7x a largura e ~1,5x o comprimento do
comodo, e boa parte dela ficou atravessando parede. E o primeiro dado que o
projeto tem sobre a arena autorada contra um comodo real medido.

**Nao resolveu:** *a segunda sessao de RA*, que agora tem sintoma nomeado. Depois
de vencer, "jogar novamente" percorre `match-over -> menu -> escolher RA`, e
`setPhase("menu")` chama `arManager.exitAR()` (`src/game/GameFlow.ts:597-600`).
Na segunda entrada **so o loader gira: sem coaching overlay e sem arena**. O
sintoma se explica pelo codigo — `src/ar/EighthWallARManager.ts:316` mantem o
loader visivel enquanto `latestTrackingStatus === null`, e numa segunda sessao o
`onUpdate` do pipeline nunca chega, entao o loader gira para sempre. Isso
descreve o SINTOMA, nao a causa; a causa continua sendo a hipotese do
`clearCameraPipelineModules()` executado no detach do behavior (hipotese 6
abaixo), que a F5 endereca.

Com isso o **criterio de aceite da F2 nao pode ser cumprido**: ele pede cinco
entradas em RA e a segunda ja trava.

**Resultado em device:** Android/Chrome, 2026-08-19, quarto de 2,60 x 2,90 m. Uma
partida completa jogada e vencida; segunda entrada travada no loader. A torre de
1,20 m foi descrita pelo jogador como "um pouco grande" para o comodo, com a
proposta de reduzir uns 20% ou permitir ajuste por pinca — proposta, nao
medicao; ver a hipotese 7.

**Cuidado ao ler esta etapa:** o Beat 4 de 64,6 s esta acima do limiar de 30 s
que a demo define como "leitura do mundo validada", mas **quem testou foi o autor
do jogo** — a mesma ressalva que o README ja carrega para os 31,3 s de
2026-08-14. O numero mede que o fluxo funciona ponta a ponta, nao que o mundo
convenceu alguem de fora.


### `9ba9e7a` — o chao nunca precisou ser medido (2026-08-19)

**Feito:** um spike descartavel em `spike/origin-recenter/` (fora de `src/`, nao
importado por nada), a extracao da superficie de API real do engine em
`.claude/skills/babylonjs-game-dev/references/8thwall-api-surface.md` (854
linhas, com procedencia por simbolo), e a [spec 08](../specs/08-fundacao-ar.md),
que substitui a spec 07.

**Provou:** o projeto estava resolvendo um problema que o 8th Wall nao tem. O
exemplo oficial de world tracking do repo `8thwall/8thwall`
(`threejs-world-effects-example`) tem 60 linhas, **nao chama `hitTest` nenhuma
vez**, poe conteudo em `y = 0` e declara `camera.position.set(0, 2, 2)` com o
comentario "This must be at a height greater than y=0". O chao e autorado, nao
medido: `XR8.XrController.updateCameraProjectionMatrix({ origin, facing })`
declara onde a camera comeca, e se `origin.y` for a altura do jogador o piso cai
em `y = 0` no frame zero. No Niantic Studio o evento de toque ja entrega
`e.data.worldPosition` pronto.

Isso reclassifica o bloqueador da medicao de piso: nao era "o `hitTest` nao mede
piso", era o projeto fazendo uma pergunta que o engine nao espera. `placementGate.ts`,
`floorEstimate.ts` e `hitTestSampling.ts` existem para nada.

A segunda inversao e maior: em todo codigo oficial **o conteudo nunca se move**.
Ele fica em coordenadas autorais fixas e quem se move e a origem da camera, via
`recenter()`. O projeto faz o oposto, arrastando `arenaRoot.position`.

Tres bugs sairam do spike, e a producao tem os tres hoje:

1. **`window.BABYLON` precisa existir antes do `xr.js` executar.** No bundle,
   `XR8.Babylonjs` sai de `mQ()`, chamada na construcao do namespace, e ela so
   cria os temporarios internos `if (window.BABYLON)`. O projeto instala o shim
   dentro de `enterAR()`, muito depois do script `async`. Os temporarios ficam
   `undefined` para sempre.
2. **O ramo destro do modulo Babylon esta quebrado neste build.** O conversor de
   quaternion usa esses temporarios so no caminho destro. Antes do conserto de
   ordem ele lancava `TypeError: Cannot read properties of undefined (reading
   'copyFrom')`; depois do conserto ele para de lancar e passa a produzir
   quaternion **NaN** — pose morta, tela preta sobre o feed. A producao so nao
   viu porque e canhota. **Ligar `useRightHandedSystem` quebra a RA inteira.**
3. **O azimute 0 esta 180 graus invertido**, nao espelhado. Ver a revogacao
   abaixo.

E `recenter()` foi caracterizado: reseta **so o yaw** (`yaw -> 0,0` exato com
pitch 48,5 e roll -1,8 preservados, arena continua nivelada — a vertical vem do
IMU e sobrevive ao gesto), mas **descarta o mapa do SLAM** (cai para `LIMITED`,
o coaching overlay volta, mais de 30 s para reconvergir). Ou seja: qualquer
varredura de calibracao tem de vir **depois** do gesto de colocacao, nunca
antes; e o gesto e caro demais para ser oferecido como correcao instantanea no
meio da acao.

**Nao resolveu:** a tentativa de **estimar deriva em partida**. A ideia era
acumular a soma vetorial dos saltos de relocalizacao — deslocamento por frame
acima do que a mao consegue produzir — e disparar o gesto acima de um limiar.
Primeira versao usava limiar por frame (5 cm) e contou movimento real como salto,
porque 5 cm/frame so vale 3 m/s a 60 fps e o loop nao roda a 60 fps. Corrigido
para velocidade real com `dt` e exigindo pico isolado, ainda assim as seis
medicoes pareadas deram media estimada de 0,155 m contra 0,082 m real, com
correlacao **levemente negativa**. **A abordagem foi abandonada por decisao (D2
da spec 08): reposicionar vira botao, sem medicao.** Nao repita este ciclo sem
sinal novo.

Tambem nao se sustentou a leitura de que **declarar altura maior estabiliza a
deriva**. As medianas de laco fechado foram 0,08 m com 1,55 m declarado e 0,07 m
com 2,00 m — iguais. `declaredHeightM` so alimenta `origin.y`, que e offset de
sistema de coordenadas e nunca entra em conta de tracking. O que separava as duas
sessoes era **textura de ambiente**: a de 2,00 m foi feita numa bancada cheia de
caixa e cabo, a de 1,55 m contra parede lisa.

**Resultado em device (Android/Chrome, 2026-08-19):**

| Medicao | Numero |
| --- | --- |
| Piso declarado assenta no chao | Sim; melhor calibracao com `delta 0.00` a 1,55 m |
| Deriva de laco fechado, varredura de flanco (+-90 graus) | 0,04 · 0,05 · 0,07 · 0,08 · 0,10 · 0,15 m (mediana 0,075) |
| Deriva de laco fechado, giro de 360 graus | 0,78 m |
| Deriva apontando para carpete liso, pitch 74 graus | 0,78 m (a pior de todas) |
| Amplitude de `camera.y` por janela | 0,36 a 1,68 m — segue a mao, nao serve de sensor isolado |

O metodo importa: o **laco fechado** (marcar, girar, voltar FISICAMENTE ao mesmo
ponto, ler o residuo) e o unico honesto. A metrica ingenua de distancia ate a
marca mistura deriva com deslocamento real e com o circulo que o celular percorre
quando a pessoa pivota — ela produziu leituras de 0,30 e 0,87 m que nao eram
deriva.

O numero de +-90 graus e o que importa, porque **o arco tem 180 graus**: cobrir a
arena inteira e girar +-90 do centro, e giro de 360 esta fora do envelope de
design. Isso virou a decisao D1 da spec 08, em forma geometrica e testavel: nada
pode chamar a atencao do jogador para fora do arco.

### `ef6c260` — o arco parava de pular, e o chao nunca esteve sendo medido (2026-08-19)

Sessao inteira dedicada a uma queixa de device: *"posicionar o arco ja estava
ruim, agora ficou bem pior, ela ancora meio em diagonal"*, refinada pelo usuario
para *"o arco fica pulando muito, nao fica estavel, fica verde mas da umas
inclinadas ou muda de lugar"*.

**Feito.** Quatro etapas, todas so compiladas antes de ir a device:

1. `src/ar/floorEstimate.ts` (novo) — altura de piso por mediana e um filtro
   temporal (`FloorTracker`) com histerese;
2. `src/ar/poseSmoothing.ts` (novo) — suavizacao exponencial independente de
   frame rate, com snap, para origem e heading do arco;
3. telemetria: `arena_placed` passou a carregar `trackingStatus`,
   `deviceHeightM`, `floorY` e `tiltDeg`, e entrou o evento `floor_fit_sample`;
4. fiacao no `EighthWallARManager`: **a arena deixou de copiar a normal medida do
   piso** (so yaw), a projecao do jogador no chao virou vertical, e o fechamento
   passou a usar os valores filtrados.

Saiu junto o codigo morto que o modelo de colocacao por toque deixou
(`fitGroundPlane`, `GroundPlaneFit`, `buildSampleOffsets`). Saldo de -169 linhas.

**Provou** — tres coisas, todas com numero de device (sessao das 00:22 UTC de
2026-08-19, 79 amostras de piso logadas a 1 Hz de 5 Hz reais):

1. **O arco parou de pular. Confirmado pelo usuario em device.** E o log explica
   o mecanismo do sintoma antigo: **53% das medicoes passavam do clamp de 12
   graus** (arena nivelada) e 47% ficavam abaixo dele (arena inclinada em ate 12
   graus). O contorno alternava entre os dois a cada 200 ms. "Da umas inclinadas"
   era isso, literalmente.

2. **A normal do fit nao e medicao, e ruido — e o `tiltDeg` mediu isso.**
   Mediana de **13,3 graus**, p75 de 24,5, maximo de **47,7**. A decisao de parar
   de inclinar a arena esta confirmada, mas **pelo motivo oposto ao previsto**: a
   hipotese era "a vertical do SLAM ja e o nivel, e o `tiltDeg` vai viver abaixo
   de 2 graus". Ele vive em 13. Isso nao diz que o chao esta torto — diz que o
   fit nao sabe onde o chao esta.

3. **O achado maior: a nuvem de pontos nao e um plano.** `spreadM` mediano de
   **32 cm**, p75 de 58 cm, maximo de 2,82 m, com **11 dos 12 pontos sobrevivendo**
   a rejeicao por mediana+MAD. Um piso medido decentemente teria 2 a 5 cm. A
   rejeicao nao filtra nada justamente porque a maioria dos pontos e ruim: MAD
   grande gera tolerancia grande, e o lixo entra como inlier. Nenhum estimador
   conserta um sensor que nao esta medindo a coisa.

**Nao resolveu.** Duas falhas, uma delas causada por esta propria sessao:

- **12 recusas de ancoragem em sequencia**, todas `bad-height`, com altura de
  device medida em **0,41 m** (6 toques) e **0,65 m** (6 toques), com o usuario de
  pe. O gate estava certo em recusar; a medicao e que estava errada. O jogo ficou
  intocavel. A reancoragem pos-relocalizacao tambem nao rodou nenhuma vez na
  sessao — morre no mesmo gate;
- **o `FloorTracker` trocou "pula sempre" por "trava numa leitura impossivel e
  defende ela".** Depois do "Reposicionar" o filtro e zerado, a primeira amostra
  aceita vira a altura vigente sem filtro nenhum, e ela veio errada. Para
  corrigir depois disso o filtro exige 3 amostras aceitas, fora da tolerancia e
  concordando entre si em 5 cm — mas **86% das amostras sao descartadas** pelo
  `MAX_SPREAD_M` de 12 cm, que foi escolhido por palpite e nao por medicao. Tres
  aceitas e concordantes quase nunca acontecem. O usuario relatou: "ficou alta
  demais e nao liberava nunca". E falha de projeto do filtro, nao do gate.

**Revoga** — duas conclusoes anteriores:

- **a recomendacao de alinhar o conteudo a normal medida do piso, com clamp de 12
  graus**, escrita na secao "Tilt" de
  `.claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md` e repetida no
  comentario de `ArenaGhost.setPose`. Ela nasceu na arena de mesa de 80 cm, onde
  12 graus valem 8 cm na borda. Num arco de 2,2 m de raio os mesmos 12 graus
  valem **47 cm**, e a normal e a grandeza pior medida do pipeline inteiro. O
  comentario do codigo ja foi corrigido nesta sessao; **a skill continua errada**
  (ver Fase 4 / proposta pendente);
- **a afirmacao, no comentario de `ArenaGhost.setPose`, de que "a world-up do
  SLAM nao bate com o chao no caso comum".** O que nao bate e o fit. Corrigido no
  arquivo.

### `ef6c260` — a hipotese 2 respondida, e uma virada de abordagem (2026-08-19)

**Provou.** O usuario ficou **parado** e deu um giro de 360 graus para olhar
atras de si. Nesse intervalo a distancia camera->arena subiu de **1,09 m para
2,9 m ainda com `trackingStatus: NORMAL`**; so depois o SLAM admitiu `LIMITED` (39
s) e a distancia chegou a **4,47 m**, voltando para ~0,9 m apos a relocalizacao.

Isso responde a **hipotese 2 deste diario** — "a ancoragem egocentrica pode
driftar mais que a atual, nao menos" — com evidencia **contra** a ancoragem
egocentrica na forma atual. Girar no lugar nao produz paralaxe e leva o quadro
para regioes que o SLAM nunca mapeou. E girar o tronco nao e um caso de uso
qualquer da v3: **e a mecanica inteira**.

Dois detalhes que a correcao precisa respeitar:

- a reancoragem so dispara em `LIMITED -> NORMAL`. **O deslocamento de 1,8 m
  aconteceu inteiro sob `NORMAL`**, onde nao existe correcao nenhuma hoje. Esse
  buraco continua aberto;
- `FEATURE_POINT` **nao deve ser removido** da lista de tipos aceitos. O usuario
  registrou historico de device: sem ele o `hitTest` emudece e nada fica verde.
  Isso vale mais que o argumento teorico de que feature point nao e superficie.

**Decisao de direcao, do usuario:** parar de tentar adivinhar o chao e **deixar o
jogador marca-lo com o dedo**. Ele tem, a 1,4 m do chao, oclusao, perspectiva e
sombra real como referencia; o SLAM tem 12 pontos ruidosos. A altura do piso e 1
grau de liberdade.

A parte nao obvia da ideia, e o motivo dela valer mais que "calibracao":
**pedir para o jogador girar para a direita e para a esquerda no setup obriga o
SLAM a mapear exatamente as direcoes que o jogo vai usar, antes da partida
comecar.** O gesto de calibracao paga a divida que causou o drift medido acima. E
o "pisca a tela ao passar do campo escaneado" converte o residuo de drift em
regra de jogo legivel, o que a v3 ja quer.

A sessao virou isso num plano — a spec 07 — que o usuario **fatiou em duas
partes**, entregando primeiro so a altura manual. O motivo do corte vale como
metodo e sobrevive ao plano que o produziu: a pergunta da varredura ("mapear
antes reduz o drift?") so e mensuravel depois que ancorar voltar a funcionar;
juntas, um resultado ruim nao diria qual das duas falhou.

**Nada disso chegou a ser implementado**, e a spec 07 ficou obsoleta uma sessao
depois, quando se descobriu que o piso nunca precisou ser medido. Esta entrada
registra dois resultados de device e uma direcao, nao uma entrega.

### `34f3ddb` — spec v3, storyboard e plano de execucao (2026-08-17)

**Feito:** chegaram ao repositorio, sem commit, `docs/guias/tower_gate_spec_v3.md`
e `docs/guias/tower_gate_storyboard.html`. A sessao leu os dois, confrontou com
`.github/copilot-instructions.md`, `README.md` e o codigo atual, e escreveu
o plano de execucao da v3, quebrado em 11 etapas com contrato e criterio de
aceite por etapa. Ele foi migrado depois para
[`docs/specs-arena-180/`](../specs-arena-180/README.md).

**Nenhum arquivo de `src/` foi tocado. Nenhum comando de build ou teste rodou.
Nada foi a device.** Esta entrada registra um plano, nao um resultado — e o plano
sera executado em uma sessao futura.

**Provou:** quatro coisas, todas por leitura do codigo confrontada com a spec —
nao por execucao.

1. **A v3 nao e uma camada sobre o prototipo; ela derruba as tres premissas em
   que ele foi construido.** Nao e retorica: `ArenaSystem.ts` deriva o grid
   inteiro de `ARENA_AUTHORED_WIDTH`/`ARENA_AUTHORED_DEPTH` e posiciona duas
   torres em `z = ±10` com caminho central unico; `DeploymentZone.ts` codifica
   "metade do jogador" como `z <= playerDeploymentMaxZ`; `CardDeckHud.ts` e a
   leitura de recurso do jogo. Nenhum dos tres sobrevive a uma arena polar
   centrada no jogador, com colocacao livre no arco e recurso lido pelo estado
   das cartas.

2. **O que sobrevive e justamente a parte cara.** A fundacao de RA — calibracao
   por escala absoluta, coaching overlay, fit de plano por `hitTest`, o gate que
   recusa por prova contraria, o blob de contato, os materiais mate, o
   comportamento ocioso, a telemetria — atravessa a v3 inteira sem mudanca de
   premissa. A v3 troca o palco, nao o motor de RA. Isso e o que torna a
   reformulacao viavel em vez de um recomeco.

3. **O bloqueador 1 do README fica mais caro na v3, nao menos.** A segunda sessao
   de RA sem recarregar a pagina continua quebrada e nunca foi tocada. Na demo
   anterior ela impedia testar varias pessoas seguidas; na v3 ela impede **o
   proprio Ato 4**, que termina em "jogar de novo" e exige sair da partida para o
   album e voltar. Deixou de ser obstaculo de metodologia e virou obstaculo de
   produto.

4. **O criterio de estabilidade mudou de forma, nao so de numero.** A v3 proibe
   deslocamento: depois que a arena fecha, o jogador gira o tronco e nao caminha.
   Medir deslize *circulando a arena* — o criterio do Beat 3, ~2 cm em 60 s —
   deixa de descrever o que o jogo faz. O criterio equivalente passa a ser
   deslize **girando no lugar**. O criterio antigo nunca chegou a ser medido
   depois que a arena virou 80 cm, e agora nem se aplica ao jogo que sera
   construido: ele nao foi respondido, foi aposentado.

**Nao resolveu:** nada foi executado. Nenhuma etapa comecou, nenhuma
decisao de design abaixo passou por device, e a tese central da v3 (atencao como
recurso) continua sem uma unica evidencia a favor ou contra. Esta e a distincao
que o diario existe para manter: o plano descreve o que deveria acontecer, e isso
nao e evidencia de que vai funcionar.

### Decisoes fechadas pelo plano (2026-08-17)

A sessao fechou **oito pontas soltas** da spec v3 §13 que precisavam de resposta
para o plano ser executavel — escala em metros, o gesto de colocacao, beber sem
timer, hierarquia de audio, condicao de derrota, o Coelho como onda final, o arco
parametrizavel e o fade das cartas.

Nenhuma foi validada em device: sao decisoes de projeto, nao resultados. A mais
fragil e a do Coelho trocando de setor, que virou a **hipotese 3** abaixo.

As oito, com o motivo de cada uma, vivem em
[`docs/specs-arena-180/decisoes.md`](../specs-arena-180/decisoes.md) como
`DJ-1`..`DJ-8`. A tabela que existia aqui era copia do documento de plano, e
copia de spec e exatamente o que este diario deixou de carregar.

### (sem commit) — a segunda sessao tem causa lida no codigo, e nao e a que a spec apostava (2026-08-20)

**Feito:** as tres unidades da Onda A e da Onda B do quadro, sem device.
`EighthWallARManager.ts` passou a reusar UMA `FreeCamera` por toda a vida do
manager (antes ela era descartada e recriada a cada entrada), a remover os
observers de render que o `xrCameraBehavior` registra e nunca remove
(`src/ar/observerLeak.ts`), e a marcar o ciclo de vida da sessao —
`enter>attach>start>update>recenter>detach>remove` — no console e no painel de
`?debug=1`. A ordem do `exitAR` inverteu: o behavior desanexa PRIMEIRO, e os
modulos do app saem no `clearCameraPipelineModules()` dele, em vez de serem
removidos antes.

Junto vieram a altura declarada ajustavel (`src/ar/playerHeight.ts` puro, com
`setPlayerHeight` no manager e o mesmo `src/ui/HeightStepper.ts` montado na tela
inicial e na fase de setup da RA) e o gesto de colocacao por
`XR8.XrController.recenter()` (`confirmArenaHere()`), que entra como transicao de
fase: a arena sai de cena, o coaching overlay volta, e o mundo so e devolvido
quando o tracking estiver `NORMAL` de novo.

`npx tsc --noEmit` limpo, `npm run build` sem erro, e a suite subiu de 180 para
**204 testes em 18 arquivos** — os 24 novos cobrem o diff de observers, a
normalizacao da altura declarada e a concordancia entre o `facing` enviado ao
engine e o azimute que o jogo consome.

**Provou:** tudo abaixo saiu de leitura do bundle (`public/8thwall/xr.js` e
`public/8thwall/xr-slam.js`), que prova o que o engine FAZ — nao o que o aparelho
mostra. A distincao importa e esta cobrada no fim desta entrada.

*O `xrCameraBehavior` vaza dois observers de render por sessao, e o `detach` dele
nao remove nenhum.* `XR8.Babylonjs` sai de uma fabrica chamada UMA vez, na
construcao do namespace (`Babylonjs: mQ()`), entao todo behavior devolvido por
`xrCameraBehavior()` compartilha o mesmo fechamento — inclusive a referencia de
cena. O `attach` faz `Q.onBeforeRenderObservable.add(...)` e
`Q.onAfterRenderObservable.add(...)` a cada chamada, com o `Observer` devolvido
descartado; o `detach` e apenas `XR8.stop()` + `XR8.clearCameraPipelineModules()`.
Consequencia direta: a enesima entrada em RA dirige `runPreRender`/`runRender`/
`runPostRender` **N vezes por frame**, enquanto o `process-gpu` e a liberacao de
textura continuam rodando uma vez. A contabilidade de estagio do pipeline nao
suporta isso.

*Os dois sintomas da segunda sessao tem uma causa comum, e ela e "o pipeline nao
entrega frame".* O modulo do coaching overlay so fica visivel quando
`updateVisibility` recebe `LIMITED` **com** `trackingReason INITIALIZING`, e esse
par so chega pelo evento `reality.trackingstatus`, que nasce do pipeline. Ou seja
"so o loader gira" (o nosso `latestTrackingStatus` nunca sai de `null`) e "sem
coaching overlay" nao sao dois defeitos: sao a mesma ausencia de frame, vista de
dois lugares.

*`reconfigureSession` nao serve para reabrir sessao, e a premissa da RA-F5 estava
errada.* No bundle ela comeca com `if (!i) throw new Error("[XR8] Cannot
reinitialize session at this time.")`, onde `i` e o flag de sessao inicializada —
depois de `XR8.stop()` ela **lanca**. E mesmo no caminho feliz ela nao redispara
`onStart` nem o `onAttach` de quem ja estava anexado: ela reaproveita a sessao em
vez de refazer o ciclo. E a API do `SessionReconfigureModule` do `xrextras`, que
troca camera frontal/traseira no meio da sessao. A spec da RA-F5 foi escrita
apostando nela como conserto.

*Uma camera de RA nova em cada sessao nao recebe a matriz de projecao do device.*
O modulo `babylonjsrenderer` guarda as ultimas intrinsics no mesmo fechamento da
fabrica, e so chama `camera.freezeProjectionMatrix(...)` quando elas MUDAM. O
mesmo aparelho devolve as mesmas intrinsics, entao a camera recriada na segunda
sessao ficaria com o campo de visao padrao do Babylon, desalinhado do feed. E o
motivo de a camera passar a ser reusada, e nao uma otimizacao.

*A pose da camera antes do attach tem a ultima palavra sobre a origem, e nao a
nossa chamada.* `rA()` dispara `onStart` e SO DEPOIS `R.attach()`; o `onAttach` do
`babylonjsrenderer` chama `updateCameraProjectionMatrix({origin: camera.position,
facing: camera.rotationQuaternion})`. Funcionava por acidente feliz ate agora — a
camera era nova, em `(0, altura, 0)` e sem rotacao, entao concordava com o que o
`applyDeclaredOrigin()` tinha acabado de declarar. Com a camera reusada isso deixa
de ser gratuito, e zerar a pose antes do attach virou obrigatorio.

*`updateRecenterPoint` ja era `true` por default*, e o ponto de `recenter()`
guarda a origem declarada. Confirma o que a RA-F3 pedia por contrato.

**Nao resolveu:** `reconfigureSession` foi **descartada como caminho** depois de
lida (ver acima). Ela ficou declarada em `src/types/xr8.d.ts` com o motivo
escrito, para ninguem reabrir o bundle e refazer a descoberta.

O **bug do replay** apareceu e nao foi consertado, por decisao: a JG-07 e a JG-11
vao reescrever boa parte do `GameFlow` e do HUD, e consertar antes seria consertar
codigo que vai sair. O achado inteiro esta anotado na
[JG-11](../specs-arena-180/JG-11-fim-album.md), que e a dona do "volta ao Ato 1".

**Resultado em device (2026-08-20, Android/Chrome, testado pelo autor).**
Evidencia: gravacao de tela de 126 s e telemetria
`tower-gate-sessao-1787242680099.json` (426 eventos, exportada aos 318,7 s). O
video comeca aos 219,7 s da telemetria, entao os dois se alinham quadro a quadro.

*A segunda sessao de RA SOBE, e o painel mostra o ciclo inteiro.* Aos 56 s de
video o `lifecycle` le `s1 …update>recenter>detach>remove` com o menu na tela; aos
66 s, `s2 enter` com o loader girando; aos 75 s, `s2 enter>start>attach>update`
com o coaching overlay desenhando "Mova o celular para frente e para tras" e o
arco fantasma no chao. **O bloqueador mais antigo do projeto caiu.** O
`xr8Observers` marca `2` em todos os quadros das duas sessoes — a captura pega
exatamente o par que o behavior registra, uma vez por sessao.

*O `onStart` dispara ANTES do `onAttach`.* A trilha e `enter>start>attach>update`,
confirmando a ordem lida no bundle (`rA()` chama `NA()` e so depois `R.attach()`).
O `detach>remove` so aparece porque a ordem do teardown foi invertida: com a
ordem antiga o modulo saia antes do `stop()` e o `onDetach` era engolido.

*`recenter()` custa tracking, e a `DR-3` deixa de ser suposicao.* `arena_placed`
aos 54,4 s e `tracking_lost LIMITED` aos 54,6 s; de novo aos 252,1 s e 252,5 s. E
o painel marca `trackingStatus: LIMITED / trackingReason: INITIALIZING` durante a
maior parte do video.

*A altura declarada NAO chega ao engine* — ver o "Cuidado ao ler" abaixo, que
deixou de ser duvida e virou resultado.

**Um defeito da propria RA-F4, provado pelo mesmo dado:** o portao da transicao
abre cedo demais. Ele fecha no `NORMAL` que ainda esta de pe no frame seguinte ao
`recenter()`, antes de o SLAM cair — por isso o painel mostra `arena: confirmada`
com `trackingStatus: LIMITED`. A transicao existe, mas espera pelo estado errado.
Junto vao dois campos de debug velhos (`arena:` sobrevive numa colocacao nova, e
`tracking:` congela depois de confirmar) e um defeito antigo que so agora ficou
alcancavel: o `hasLostTracking` de `main.ts` nunca e zerado quando o monitor
rearma, entao os pares `tracking_lost`/`tracking_recovered` nao sao confiaveis
entre partidas.

**Cuidado ao ler esta etapa — a contradicao FECHOU, e contra a RA-F3.** O
paragrafo abaixo foi escrito antes do device do mesmo dia; o device deu razao a
leitura do bundle. Fica como estava, porque mostra o raciocinio que levou ao
teste certo. Em `updateCameraProjectionMatrix`, com
`scale: "absolute"` (o modo deste projeto), o codigo faz `P.y = 1` depois de
copiar a origem declarada — a altura declarada e sobrescrita para 1 metro no
`origin` que vai ao tracker, embora o ponto de `recenter()` guarde o valor
declarado. Isso contradiz o que o device mostrou em 2026-08-19, quando a arena
assentou no chao real com 1,55 m declarado e a melhor calibracao deu `delta 0.00`.
Ou o bundle minificado foi lido errado, ou o 1,55 estava agindo por outro caminho.
Virou a **hipotese 8** abaixo, e o criterio de aceite da RA-F3 a decide de graca.

## Hipoteses

O progresso de validacao do experimento — o que ja foi respondido, o que foi
refutado, e o que continua aposta. Cada uma carrega o **teste concreto** que a
decide; hipotese sem teste e opiniao.

| # | Hipotese | Situacao |
|---|---|---|
| 1 | a tese central pode simplesmente nao ser divertida | **VIVA** — sem nenhuma evidencia, a favor ou contra |
| 2 | girar no lugar derruba o tracking | **RESPONDIDA** (2026-08-19) — nao derruba dentro do arco: 0,075 m de mediana |
| 3 | `DJ-6` (o Coelho trocando de setor) pode nao resolver nada | **VIVA** — so playtest responde |
| 4 | a torre de 1,20 m pode intimidar crianca em festa | **VIVA** — nunca testada com crianca |
| 5 | o cogumelo verde pode nao ter tuning viavel | **VIVA** — nao instrumentado |
| 6 | a segunda sessao falha porque ninguem chama `run`/`stop` | **RESPONDIDA** (2026-08-20) — a causa eram observers de render vazados; removidos, a 2a sessao sobe em device |
| 7 | a arena e grande demais para o comodo tipico | **VIVA** — uma medicao so, e num comodo que nao cabe |
| 8 | em `scale: "absolute"` o engine ignora a altura declarada | **RESPONDIDA** (2026-08-20) — ignora mesmo: `origin.y` e fixado em 1 m, medido em device |
| 9 | o jogo nao reseta a partir da terceira partida seguida | **VIVA** (2026-08-20) — visto em device; o lado do jogo emudece e o da RA continua |

Ordenadas por suspeita, nao por ordem de descoberta. **A numeracao e estavel de
proposito** — o README e as specs citam "hipotese 2" e "hipotese 6" pelo numero,
entao itens novos entram no fim e dizem onde ficam na ordem de suspeita, em vez de
renumerar tudo.

1. **A tese central pode simplesmente nao ser divertida.** Girar para cobrir tres
   flancos com um par de olhos pode ler como trabalho, nao como jogo — e nada
   prova o contrario antes de alguem jogar.
   **Teste:** o jogo minimamente jogavel em device (arena, ondas, alertas,
   colocacao e cartas), com alguem que nao conhece o jogo, medindo se a pessoa
   gira por curiosidade ou so quando a seta manda. A
   propria spec §12 nomeia esse corte: "passos 1-4 provam a tese; se a mecanica
   de atencao nao for divertida ali, o resto nao salva".

2. **RESPONDIDA, e a resposta melhorou muito com medicao honesta (2026-08-19).**
   O registro anterior dizia 1,09 m -> 2,9 m sob `NORMAL`, e concluia que a tese
   estava ameacada. Aquela metrica media distancia ate um ponto marcado, o que
   mistura deriva com deslocamento real do jogador e com o circulo que o celular
   percorre quando a pessoa pivota. Com **laco fechado** (voltar fisicamente ao
   ponto), a deriva na varredura de flanco (+-90 graus) e de **0,075 m de
   mediana**, e o pior caso — 0,78 m — aparece so no giro de 360 graus e
   apontando para carpete liso.
   Como o arco tem 180 graus, +-90 **e** o envelope do jogo. A tese nao esta
   ameacada pela deriva; ela esta condicionada a **nao induzir giro para fora do
   arco** (decisao D1) e a ambiente com textura.
   **O que continua aberto:** se a deriva **acumula** ao longo de uma partida de
   3 minutos. As tres medidas de uma sessao curta foram 0,05 -> 0,08 -> 0,15
   (parece crescer) e as de outra foram 0,07 -> 0,10 -> 0,04 (nao cresce). Duas
   amostras nao decidem.
   **Teste:** entrar, marcar, fazer so varredura de flanco por 3 minutos, e medir
   o laco fechado a cada minuto.

3. **`DJ-6` (o Coelho trocando de setor) pode nao resolver nada.** Foi escolhida para
   evitar dois defeitos conhecidos, sem evidencia de que a terceira opcao nao tem
   um defeito proprio — perseguir um alvo que muda de setor pode ler como o pior
   dos dois mundos.
   **Teste:** so playtest, e e a primeira coisa a rever depois que a tese
   (hipotese 1) for testada.

4. **A torre de 1,20 m pode intimidar crianca em festa** (spec §13). A escala foi
   escolhida para virar presenca; presenca perto demais e ameaca.
   **Teste:** o Coelho de 0,70 m a 1 m de distancia, com crianca, antes de
   qualquer material de divulgacao.

5. **O cogumelo verde pode nao ter tuning viavel.** Ou coletar vale sempre a pena
   e o jogador ignora a defesa, ou nunca vale e vira ruido. Nascer atras dos
   inimigos ajuda, mas nao garante que exista um valor no meio.
   **Teste:** instrumentar a taxa de coleta contra a taxa de dano tomado no
   mesmo intervalo.

6. **REFUTADA NA PREMISSA (2026-08-19).** A hipotese dizia que a segunda sessao
   falha porque "o projeto nunca chama `XR8.run()`/`XR8.stop()`". Lido no bundle:
   o `xrCameraBehavior` chama **os dois** — o `attach` termina em
   `XR8.run({ canvas, ownRunLoop: false, ... })` e o `detach` faz `XR8.stop()` +
   `XR8.clearCameraPipelineModules()`. Quem seguir aquela pista procura no lugar
   errado.
   **Suspeito de 2026-08-19 — enfraquecido:** o `clearCameraPipelineModules()`
   no detach, que limpa tambem os modulos do app. Ele existe e faz isso, mas nao
   explica sozinho: o `enterAR` seguinte re-adiciona os dois modulos, entao o
   `clear` e simetrico. A saida proposta na epoca — trocar o ciclo por
   `XR8.reconfigureSession({ runConfig })` — **nao existe**: lida no bundle em
   2026-08-20, ela lanca quando a sessao nao esta inicializada, ou seja depois de
   `XR8.stop()`. Ver a entrada de 2026-08-20 na linha do tempo.

   **Suspeito de 2026-08-20, com mecanismo lido no codigo:** o `attach` do
   `xrCameraBehavior` registra dois observers de render na cena a cada entrada, e
   o `detach` dele nao remove nenhum. A enesima sessao dirige o pipeline do engine
   N vezes por frame, com `process-gpu` e liberacao de textura rodando uma vez —
   e "o pipeline nao entrega frame" explica os DOIS sintomas de uma vez (loader
   eterno e coaching overlay ausente), porque o overlay so aparece por evento
   `reality.trackingstatus`.

   **RESPONDIDA em device (2026-08-20, Android/Chrome, testado pelo autor).**
   O teste era ler o campo `lifecycle` com `?debug=1`, e ele leu
   `s2 enter>start>attach>update` com o coaching overlay desenhando e o arco
   fantasma no chao — a segunda sessao sobe, sem recarregar a pagina. O
   `xr8Observers` marcou `2` nas duas sessoes, entao a captura pega exatamente o
   par que o behavior registra. **A causa era o vazamento de observers.**

   Dois detalhes que o teste entregou de brinde: a ordem real e
   `enter>start>attach>update` (o `onStart` vem ANTES do `onAttach`, como o
   bundle dizia), e o `detach>remove` so aparece porque a ordem do teardown foi
   invertida.

   **O que continua aberto:** o criterio de aceite da RA-F5 pede **cinco**
   entradas seguidas com a arena no chao nas cinco. Foram vistas **duas**.

   **Evidencia nova (2026-08-19, device):** o sintoma foi observado por inteiro —
   na segunda entrada so o loader gira, **sem coaching overlay e sem arena** —, e
   o overlay funciona normalmente na primeira. Isso e consistente com o suspeito
   (os modulos do app, o de status e o do overlay, sao limpos no detach e o que
   os re-adiciona nao volta a rodar), mas **nao prova o mecanismo**: nenhum log de
   `XR8.run`/`stop`/`clearCameraPipelineModules` foi capturado no aparelho. Para
   provar, instrumente o `onAttach`/`onDetach`/`onStart` do modulo de status e
   olhe quais deles disparam na segunda entrada.

7. **A arena autorada pode ser grande demais para o comodo tipico** (suspeita
   alta hoje — atras so da hipotese 1). Medido em device em 2026-08-19: arena de
   4,4 x 4,4 m com torres a `z = +-2,0 m` num quarto de 2,60 x 2,90 m. A partida
   fechou, e o jogador descreveu o arco como "ate correto" mas a torre de 1,20 m
   como "um pouco grande", propondo reduzir uns 20% ou permitir ajuste por pinca.

   Essa proposta **contradiz uma decisao escrita do projeto**: a escala em RA e
   fixa em 1 porque cada ator ja nasce com o tamanho fisico da spec
   (`src/arena/metrics.ts`), e o comentario de `applyArenaScale` argumenta que um
   controle de escala "so deixaria o jogador desmentir esse tamanho". As duas
   coisas nao podem valer ao mesmo tempo: ou a escala fisica e o ponto (e o
   comodo pequeno e uma limitacao a comunicar), ou ela e negociavel (e a decisao
   cai).

   **O que ainda nao foi medido:** um comodo que CABE. Uma unica sessao num
   quarto de 2,6 m nao separa "a arena e grande demais" de "este comodo e pequeno
   demais". **Teste:** rodar a mesma partida num espaco de 5 x 5 m ou ao ar
   livre, sem mudar nada de codigo, e perguntar de novo sobre a torre. Se ali ela
   parecer certa, o problema e de comunicacao de requisito de espaco, nao de
   escala.

8. **Em `scale: "absolute"` o engine pode estar ignorando a altura declarada**
   (entra no fim por numeracao estavel, mas a suspeita e alta — ela questiona a
   fundacao inteira da RA-F2). Lido em `public/8thwall/xr-slam.js` em 2026-08-20:
   `updateCameraProjectionMatrix` copia a origem recebida, guarda o ponto de
   `recenter()` com ela, e entao faz `P.y = 1` quando o modo e `absolute` — a
   altura declarada nao chega ao tracker.

   Isso **contradiz o device**. Em 2026-08-19 a arena assentou no chao real com
   1,55 m declarado, e o painel deu melhor calibracao em `delta 0.00` — se
   `origin.y` fosse sempre 1, declarar 1,55 ou 1,90 daria o mesmo resultado, e a
   comparacao que escolheu 1,55 nao teria como ter acontecido. Uma das duas
   leituras esta errada: ou o bundle minificado foi mal interpretado, ou o 1,55
   agiu por um caminho que ninguem mapeou.

   **RESPONDIDA em device no mesmo dia (2026-08-20), e a leitura do bundle estava
   certa.** A medida nao precisou do controle: a telemetria amostra a distancia
   da camera ate a origem a cada 500 ms, e logo depois de um `recenter()` a
   camera ESTA na origem declarada — entao a primeira amostra apos cada
   `arena_placed` le o `origin.y` que o engine de fato usou.

   Quatro colocacoes, todas com `originY: 1.55` no painel:
   **1,0049 · 0,9797 · 1,0134 · 1,0043**. Se a altura declarada valesse, seriam
   ~1,55. Sao 1,00 — exatamente o `P.y = 1` do bundle.

   **O que isso significa, e e maior que a RA-F3.** O piso NAO cai em zero por
   causa do numero declarado; ele cai em zero porque o engine assume que o
   celular esta a 1 m do chao no instante da colocacao. O 1,55 de 2026-08-19
   nunca esteve agindo — a arena assentou porque o jogador, olhando para o chao
   para colocar, segurava o celular perto de 1 m. **A RA-F2 continua funcionando;
   a explicacao dela e que estava errada.**

   **Consequencia:** o controle de altura sai da tela (decisao de 2026-08-20,
   anotada na [JG-07](../specs-arena-180/JG-07-cartas-3d.md)). A normalizacao em
   `src/ar/playerHeight.ts` fica, porque a guarda contra `origin.y` nao-finito
   continua valendo.

9. **O jogo nao reseta a partir da terceira partida seguida** (suspeita alta —
   e o unico defeito que hoje impede uma sessao longa). Visto em device em
   2026-08-20, com video e telemetria.

   Depois da segunda partida terminar, **nenhum evento nascido no `GameFlow` ou
   no `CombatEngine` voltou a ser registrado** — sem `enemy_awakened`, sem
   `card_deployed`, sem `match_ended` — enquanto o `arena_placed`, que nasce no
   AR Manager, registrou normalmente mais duas vezes. E o video mostra uma
   terceira partida acontecendo inteira: relogio 2:58 -> 2:31, torre inimiga de
   1000 para 123, HUD congelando como `match-over` congela, e o menu depois.

   **A pista mais forte nao fecha sozinha:** o conjunto que emudeceu e
   exatamente o que `GameFlow.dispose()` e `CombatEngine.dispose()` limpam com
   `Observable.clear()`. So que os dois so sao chamados pelo
   `scene.onDisposeObservable`, que tambem descartaria HUD, tela inicial e painel
   de debug — e os tres continuaram desenhando.

   **Ja descartado:** nao houve mensagem de erro na tela inicial (logo nao foi
   `handleSessionFailed`) nem erro no console — as duas confirmadas pelo usuario.
   O "Reposicionar" foi usado uma vez na terceira partida e explica a colocacao
   extra na telemetria, **nao** o emudecimento.

   **Teste:** instrumentar a contagem de observadores de
   `onMatchOverObservable`/`onCardDeployedObservable` a cada troca de fase e
   jogar tres partidas seguidas. Se a contagem cair para zero sem `dispose()`,
   o alvo e quem chama `clear()`. Conserto declarado na
   [JG-11](../specs-arena-180/JG-11-fim-album.md), que e a dona do replay.

