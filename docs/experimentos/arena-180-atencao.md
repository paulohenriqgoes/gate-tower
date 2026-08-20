# Experimento: arena de 180 graus e atencao como recurso

Diario da v3 do Tower Gate — a reformulacao que existe para responder **uma
pergunta que a demo anterior nao podia responder**: *a RA da para ser mecanica, e
nao cenografia?* Registra o que foi decidido, o que foi construido, o que cada
teste em device mostrou e o que continua aberto. Ultima atualizacao:
**2026-08-19**.

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

### (sem commit) — a fundacao de RA em device: a arena assenta, a partida fecha, a segunda sessao nao abre (2026-08-19)

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
que morreu testava medicao de piso e suavizacao da pose do preview. Nada
commitado.

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


### (sem commit) — o chao nunca precisou ser medido (2026-08-19)

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

### (sem commit) — o arco parava de pular, e o chao nunca esteve sendo medido (2026-08-19)

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

### (sem commit) — a hipotese 2 respondida, e uma virada de abordagem (2026-08-19)

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

O plano executavel esta em
[`docs/specs/07-calibracao-manual-do-piso.md`](../specs/07-calibracao-manual-do-piso.md).
Foi **fatiado em duas ondas** por decisao do usuario: Onda 3 entrega so a altura
manual (que e o que desbloqueia), Onda 4 traz raio ajustavel, varredura e
fronteira. O motivo do corte: a pergunta da varredura ("mapear antes reduz o
drift?") so e mensuravel depois que ancorar voltar a funcionar; juntas, um
resultado ruim nao diria qual das duas falhou.

**Nada da Onda 3 foi implementado.** Esta entrada registra um plano e dois
resultados de device, nao uma entrega.

### (sem commit) — spec v3, storyboard e plano de execucao (2026-08-17)

**Feito:** chegaram ao repositorio, sem commit, `docs/guias/tower_gate_spec_v3.md`
e `docs/guias/tower_gate_storyboard.html`. A sessao leu os dois, confrontou com
`.github/copilot-instructions.md`, `README.md` e o codigo atual, e escreveu
[`docs/guias/tower_gate_v3_plano_etapas.md`](../guias/tower_gate_v3_plano_etapas.md):
11 etapas, cada uma com objetivo, arquivos-alvo, contrato, criterio de aceite,
forma de validacao, fora de escopo, sub-agent e modelo, organizadas em 9 ondas de
execucao.

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

**Nao resolveu:** nada foi executado. Nenhuma das 11 etapas comecou, nenhuma
decisao de design abaixo passou por device, e a tese central da v3 (atencao como
recurso) continua sem uma unica evidencia a favor ou contra. Esta e a distincao
que o diario existe para manter: o plano descreve o que deveria acontecer, e isso
nao e evidencia de que vai funcionar.

### Decisoes fechadas pelo plano (2026-08-17)

A spec v3 §13 deixa pontas soltas. Oito precisavam de resposta para o plano ser
executavel e foram fechadas **no documento de plano**, todas reversiveis, todas
com o motivo registrado. Nenhuma foi validada em device; sao decisoes de projeto,
nao resultados.

| # | Decisao | Motivo curto |
|---|---|---|
| D1 | Escala 1 unidade = 1 metro; `AR_ARENA_SCALE` deixa de existir | a v3 especifica tudo em metros, e as constantes que justificavam o fator estao sendo reescritas de qualquer jeito |
| D2 | Colocacao = pressionar a carta, mirar, soltar (um gesto) | a spec pede "um gesto so"; dois toques sao duas viagens de enquadramento |
| D3 | Beber o cha = tocar no caldeirao enquadrado, sem timer | a janela de vulnerabilidade **e** o ato de enquadrar; um timer por cima seria punicao dupla |
| D4 | Audio: torradeira > alerta de flanco > impacto > tropa > ambiente | a torradeira e a unica informacao que o jogador nao tem como obter olhando |
| D5 | Derrota = torre cair; estoque zerado nunca encerra | recomendacao da propria spec §13; o cogumelo roxo existe para isso |
| D6 | Coelho = onda final, troca de setor a cada ~20 s | evita os dois extremos: fixo no central torna os laterais decoracao, circular obriga perseguicao |
| D7 | `ARENA_ARC_DEG = 180`, parametrizavel | testar 120 graus vira troca de constante, sem tocar em logica |
| D8 | Cartas com fade para 35% durante a mira; a pressionada nunca some | fecha "mirar longe vs. ler cartas" sem esconder qual carta esta na mao |

**D6 e a mais fragil** — e a decisao do plano com maior chance de cair no
primeiro playtest, e esta marcada como provisoria no proprio documento.

## Estado atual (2026-08-19)

| | Situacao |
|---|---|
| Spec v3 e storyboard | **Escritos**, no repo, sem commit |
| Plano de execucao em 11 etapas | **Escrito**; Etapas 1, 2 e 3 implementadas |
| Tese central (atencao como recurso) | **Sem nenhuma evidencia** — nao existe prototipo que a exercite |
| Arena polar de 180 graus (Etapa 1) | **Implementada**, logica pura com teste |
| Escala de sala, torre 1,20 m (Etapa 2) | **Implementada**; nao avaliada em device por si so |
| Ancoragem egocentrica (Etapa 3) | **SUPERADA pela F2.** Nao existe mais ancoragem: a arena e autorada na origem e nunca se move |
| F2 da spec 08 (arena na origem) | **Implementada, nao commitada.** Compila, 180 testes, builda; **em device: uma partida completa jogada e vencida**. Criterio de aceite (cinco entradas) **nao cumprido** — a segunda entrada trava |
| Piso declarado por `origin.y` | **FUNCIONA em device (2026-08-19)**: com 1,55 m declarado a arena assentou no chao real, sem medir nada |
| Arco do preview tremendo/inclinando | **RESOLVIDO**, confirmado em device 2026-08-19 |
| Medicao do piso | **REMOVIDA do codigo** (F2). `placementGate`, `floorEstimate`, `hitTestSampling` e `poseSmoothing` sairam com seus testes. A spec 07 esta obsoleta e nunca comecou |
| Deriva girando no lugar | **MEDIDA com laco fechado (2026-08-19)**: mediana de **0,075 m** na varredura de flanco (+-90 graus, que e o envelope do jogo) e **0,78 m** no giro de 360, que o design nao exige. O numero antigo de 1,09 -> 2,9 m vinha de metrica que misturava deriva com deslocamento real |
| Ordem de carregamento do `BABYLON` | **CONSERTADA** (F2). O `xr.js` saiu do `index.html` e e injetado por `src/ar/xr8Loader.ts` depois do shim. Rodou uma sessao completa em device |
| `useRightHandedSystem` | **CAMINHO FECHADO**. O ramo destro deste build produz quaternion NaN. O projeto fica canhoto |
| Azimute 0 | **CONSERTADO** (F2), em quatro lugares que precisavam concordar: heading do mundo, `ArenaArc.toArc/toLocal`, alvo da camera do modo tela e rotacao das barras do `ArenaGhost`. Confirmado em device: a torre certa nasce a frente |
| `recenter()` | **CARACTERIZADO**: reseta so o yaw, preserva a gravidade, e **descarta o mapa** do SLAM |
| Ondas convergindo ao jogador (Etapa 4) | **Nao iniciada** |
| Alertas de flanco e audio (Etapa 5) | **Nao iniciados**; o projeto continua **sem modulo de audio** |
| Colocacao com anel, cartas, caldeirao, album (6-11) | **Nao iniciadas** |
| Segunda sessao de RA sem recarregar | **Quebra**, agora com sintoma nomeado (2026-08-19): so o loader gira, sem coaching overlay e sem arena. O overlay funciona na PRIMEIRA entrada, o que isola o defeito no ciclo de vida da sessao. Enderecada pela F5 |
| Pegada da arena contra comodo real | **NAO CABE, e nunca tinha sido medido.** Arena autorada com 4,4 x 4,4 m contra um quarto de 2,60 x 2,90 m. A partida fechou assim mesmo. Decisao de escala em aberto — ver hipotese 7 |
| Superficie de API do engine | **DOCUMENTADA** em `.claude/skills/babylonjs-game-dev/references/8thwall-api-surface.md`, 854 linhas com procedencia por simbolo |
| Skills de RA | **DESATUALIZADAS no essencial**; as duas chamadas mortas (`imageTargets`, `recenterWithOrigin`) foram corrigidas pela F7.a. O ensino de fit de piso por `hitTest` continua la, e sai so na F7.b |

## Hipoteses vivas

Em ordem de suspeita, com o teste que decide cada uma. **A numeracao e estavel de
proposito** — o README e a spec 08 citam "hipotese 2" e "hipotese 6" pelo numero,
entao itens novos entram no fim e dizem onde ficam na ordem de suspeita, em vez de
renumerar tudo.

1. **A tese central pode simplesmente nao ser divertida.** Girar para cobrir tres
   flancos com um par de olhos pode ler como trabalho, nao como jogo — e nada no
   plano prova o contrario antes da Onda 6.
   **Teste:** as Etapas 1-7 jogaveis em device, com alguem que nao conhece o
   jogo, medindo se a pessoa gira por curiosidade ou so quando a seta manda. A
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

3. **D6 (o Coelho trocando de setor) pode nao resolver nada.** Foi escolhida para
   evitar dois defeitos conhecidos, sem evidencia de que a terceira opcao nao tem
   um defeito proprio — perseguir um alvo que muda de setor pode ler como o pior
   dos dois mundos.
   **Teste:** so playtest. E a primeira coisa a rever depois da Onda 6.

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
   **Suspeito novo:** o `clearCameraPipelineModules()` no detach, que limpa
   tambem os modulos do app. **Teste:** trocar o ciclo por
   `XR8.reconfigureSession({ runConfig })`, que existe no bundle e e o que o
   `xrextras` usa. Enderecada pela F5 da [spec 08](../specs/08-fundacao-ar.md).

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

## Proximos passos

O plano de 11 etapas continua valendo para o **jogo**. A fundacao de RA saiu dele
e virou a [spec 08](../specs/08-fundacao-ar.md), que **substitui a spec 07**.

**1. Commitar a F2 e a F7.a.** Dois commits separados: a refatoracao de `src/` e
a correcao da skill nao tem relacao uma com a outra.

**2. F5 ANTES de F3 e F4 — mudanca de ordem contra a spec 08.** A spec poe a F5
na Onda 5; o device de 2026-08-19 mostrou que ela e o gargalo de **toda**
validacao seguinte. Sem segunda sessao nao da para cumprir o criterio de aceite
da propria F2 (cinco entradas), e cada teste de F3 ou F4 custa um recarregamento
de pagina inteiro. Trocar o ciclo de vida por `XR8.reconfigureSession({ runConfig })`
e o passo que devolve iteracao rapida ao resto.

Antes de trocar, instrumente: logar `onAttach`/`onDetach`/`onStart` do modulo de
status e ver quais disparam na segunda entrada. E o que transforma a hipotese 6
em causa provada, em vez de trocar a API e torcer.

**3. F3 e F4, nesta ordem** (mesmo arquivo): altura do jogador como `origin.y`,
depois `recenter()` como colocacao e reposicionamento. A F4 tambem devolve ao
jogador a escolha de para onde o arco olha — hoje o prompt diz so "toque para
entrar" porque essa escolha nao existe entre a F2 e a F4.

**4. Decidir a escala** (hipotese 7), e decidir antes de qualquer playtest com
gente de fora: ou a arena encolhe, ou o requisito de espaco vira parte de como o
jogo se apresenta. Nao decida com uma sessao so — rode a mesma partida num
espaco grande primeiro.

**5. F6 e depois F7.b.** A adocao do `xrextras` e a reescrita das skills de RA,
que depende da evidencia de device acumulada ate ali.

**6. Retomar a Etapa 4 do plano da v3** (diretor de ondas) e seguir para a
validacao da tese com alguem de fora — que continua sendo o corte que decide o
resto do projeto.

**Medicao que ficou pendente:** se a deriva acumula ao longo de 3 minutos de
varredura de flanco (hipotese 2). Nao bloqueia nada acima.

**Divida tecnica de lateralidade — QUITADA (2026-08-19).** O registro anterior
apontava dois problemas: o comentario de `src/ar/arenaHeading.ts` mandando ligar
`useRightHandedSystem` (e afirmando falsamente que `main.ts` ja ligava), e o zero
do azimute em `-Z`. A F2 resolveu os dois — o comentario saiu e o zero virou
`+Z`, em quatro lugares. O que **continua valendo como aviso permanente**: ligar
`scene.useRightHandedSystem` neste build produz quaternion NaN e mata a pose. O
caminho destro segue fechado.
