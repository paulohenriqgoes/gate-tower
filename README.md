# Tower Gate

Jogo de cartas em Realidade Aumentada (RA), jogado de pe, com o celular na mao:
o jogador e o vertice da arena e defende tres flancos. **Atencao — para onde o
celular esta apontado — e o recurso escasso.**

**O que "atencao" significa mudou em 2026-08-21 (`DJ-9`).** Ate entao o recurso
era **ver**: um arco de 180 graus contra um FOV de 60, com dois tercos sempre
cegos. Hoje a arena e um retangulo a frente do jogador que **cabe inteiro no
quadro** — ver e de graca — e o recurso caro e **agir**: colocar carta e mirar a
fireball so acontecem dentro de um cone de 20 graus centrado na mira. A tensao e
*"vejo tres incendios e so consigo apagar um por vez"*. A decisao esta em
[`decisoes.md`](docs/specs-arena-180/decisoes.md) (`DJ-9`), e a fonte e o docblock
de `src/arena/ArenaArc.ts`.

A leitura de campo do Clash Royale continua sendo a referencia de origem, mas as
lanes sairam de escopo na v3: nao ha caminho, e a tropa nasce onde o jogador
apontou.

## Estado Atual

**Foco atual: executar a v3 — arena de 180 graus e atencao como recurso.**
A [spec v3](docs/guias/tower_gate_spec_v3.md) (2026-08-17) parte de um
diagnostico duro do prototipo atual: travando a camera e trocando por uma camera
3D comum, **o jogo nao muda** — nada no gameplay depende da pose do dispositivo,
e a RA e cenografia cara. A v3 transforma enquadramento em recurso escasso.
*Cuidado ao ler a spec v3 e o storyboard: os dois descrevem o arco de 180 (e o de
90) com flancos cegos, que a `DJ-9` superou — ver a abertura deste arquivo.*

Com isso morrem a arena de mesa, o caminho unico central e o HUD 2D de combate.

> **O que ja esta pronto e o que falta fica em
> [`docs/specs-arena-180/README.md`](docs/specs-arena-180/README.md), e so la.**
> Aquele quadro tem uma linha por unidade de trabalho, com o estado, a evidencia
> que o sustenta e o comando que o verifica. Este README **nao** repete estado da
> v3 — se algum outro documento discordar do quadro, o quadro esta certo.
> A investigacao — o que cada tentativa **provou** — vive em
> [`docs/experimentos/arena-180-atencao.md`](docs/experimentos/arena-180-atencao.md).

**A fundacao de RA foi refeita do zero em 2026-08-19, depois de ler o codigo
oficial do 8th Wall.** O projeto media o chao com `hitTest`; o engine espera que
voce o **declare**. O exemplo oficial de world tracking nao chama `hitTest`
nenhuma vez: ele poe conteudo em `y = 0` e declara a posicao inicial da camera
com `XR8.XrController.updateCameraProjectionMatrix({ origin, facing })`. Se
`origin.y` for a altura em que o celular esta, o piso cai em `y = 0` de graca.
*(Em 2026-08-20 esse "se" ganhou um limite medido: em escala absoluta o engine
fixa `origin.y` em 1 m e ignora o valor declarado — ver os bloqueadores.)*

Essa refundacao foi implementada e **confirmada em device** (`066a5d7`): a arena
assentou no chao real sem medir nada, e sustentou uma
partida completa, jogada e vencida, sem perder tracking uma vez sequer. As
unidades de RA que faltam, e o estado de cada uma, estao no quadro.

A demo do mundo vivo foi **encerrada por mudanca de direcao**, nao por resposta:
a pergunta dela nunca chegou a ser medida com alguem de fora, e o palco em que
ela media saiu de escopo.

### Bloqueadores conhecidos (2026-08-21, vistos em device)

Leia isto antes de mexer em qualquer coisa. **O mais novo e o item 6, e ele
restringe design, nao codigo** — a numeracao e estavel, entao ele entrou no fim
mesmo sendo o mais importante para a proxima sessao.

1. **RESOLVIDO em 2026-08-20 — a segunda sessao de RA sobe sem recarregar a
   pagina.** Confirmado em device (Android/Chrome): o painel de `?debug=1` leu
   `s1 …recenter>detach>remove` no menu e depois
   `s2 enter>start>attach>update`, com coaching overlay e arco fantasma no chao.

   **A causa nao era a que este arquivo dizia.** Era o `attach` do
   `xrCameraBehavior`, que registra dois observers de render na cena a cada
   entrada enquanto o `detach` dele nao remove nenhum: a enesima sessao dirigia o
   pipeline do engine N vezes por frame, e o pipeline emudecia. Como o coaching
   overlay so aparece por evento vindo do pipeline, "so o loader girando" e "sem
   overlay" eram o mesmo defeito visto de dois lugares.

   **Nao persiga estas duas pistas, as duas estao mortas:** "o projeto nunca
   chama `XR8.run()`/`XR8.stop()`" (o behavior chama os dois) e "troque o ciclo
   por `XR8.reconfigureSession()`" (ela lanca depois de `XR8.stop()`; nao reabre
   sessao).

   **Correcao escrita em 2026-08-20**, lendo o bundle: a saida que o projeto
   vinha propondo — `XR8.reconfigureSession()` — **nao existe como conserto**.
   Ela lanca depois de `XR8.stop()`, porque exige sessao inicializada; serve para
   trocar `runConfig` numa sessao viva, nao para reabrir uma derrubada.

   A causa lida no codigo e o `attach` do `xrCameraBehavior`, que registra dois
   observers de render na cena a cada entrada enquanto o `detach` dele nao remove
   nenhum: a enesima sessao dirige o pipeline do engine N vezes por frame. Isso
   explica os dois sintomas de uma vez, porque o coaching overlay so aparece por
   evento vindo do pipeline. **Corrigido no codigo, e ainda NAO testado em
   device** — a instrumentacao de ciclo de vida (`?debug=1`, campos `lifecycle` e
   `xr8Observers`) foi escrita para decidir isso no aparelho.

   Duas hipoteses anteriores continuam **erradas** e nao devem ser perseguidas:
   "o projeto nunca chama `XR8.run()`/`XR8.stop()`" (o behavior chama os dois) e
   "o culpado e o `clearCameraPipelineModules()`" (ele e simetrico — o `enterAR`
   seguinte re-adiciona os modulos).

   **Este continua sendo o gargalo de toda validacao em device**, porque enquanto
   nao for confirmado cada teste custa um recarregamento de pagina. Plano em
   [`RA-F5`](docs/specs-arena-180/RA-F5-segunda-sessao.md).
2. **A partir da terceira partida seguida, o jogo nao reseta e fica injogavel**
   (novo, visto em device em 2026-08-20). O lado da RA continua fiado — a arena
   recoloca, o tracking responde —, mas **nenhum evento nascido no `GameFlow` ou
   no `CombatEngine` volta a ser registrado**, e a maquina de estado para de
   acompanhar. Nao bloqueia trabalho de codigo, mas **bloqueia qualquer teste
   longo em device**. O achado completo esta na hipotese 9 de
   [`arena-180-atencao.md`](docs/experimentos/arena-180-atencao.md); o conserto e
   trabalho da JG-11, que e a dona do "jogar de novo".
3. **Ligar `scene.useRightHandedSystem` quebra a RA inteira.** O ramo destro do
   modulo Babylon deste build produz quaternion **NaN**: a pose morre e a tela
   fica preta sobre o feed da camera. Confirmado em device em 2026-08-19. O
   comentario de `src/ar/arenaHeading.ts` que mandava ligar essa flag **ja saiu**
   (F2), mas o perigo continua: nao ligue.
4. **A arena autorada nao cabe num quarto pequeno.** Ela tem 4,4 x 4,4 m (o
   diametro do arco de 2,2 m de raio), com as torres a `z = +-2,0 m`. A sessao de
   2026-08-19 rodou num quarto de 2,60 x 2,90 m: a partida fechou, mas boa parte
   da arena ficou atravessando parede, e a torre de 1,20 m foi descrita como "um
   pouco grande". **Decisao de escala em aberto**, com o teste que a decide em
   [`decisoes.md`](docs/specs-arena-180/decisoes.md) — nao decida com uma sessao
   so, num comodo que nao cabe.
5. **Colocar a arena numa mesa/bancada** ficou **sem veredito para sempre**: a v3
   aposentou a pergunta, porque a arena nasce no chao ao redor do jogador.
6. **Movimento brusco quebra o SLAM e a arena salta — em qualquer amplitude**
   (novo, visto em device em 2026-08-21 no build `613ae10`, Android/Chrome, pelo
   autor). **O parametro e velocidade angular, nao angulo**: a `DJ-9` encolheu a
   troca de mira para 20 graus entre cones vizinhos e a arena saltou assim mesmo.
   Nao ha conserto na camada do app — motion blur e perda de correspondencia de
   features derrubam o VIO para dead reckoning por IMU, e o salto e a correcao
   voltando de uma vez.

   **Cuidado ao ler o paragrafo "deixou de ser bloqueador" abaixo:** os 7,5 cm de
   mediana foram medidos por laco fechado, que exige giro **lento** para ser
   medida. Ele vale, e vale so para rotacao lenta. O eixo de velocidade nunca foi
   medido, e a medicao esta na hipotese 10 de
   [`arena-180-atencao.md`](docs/experimentos/arena-180-atencao.md): registrar
   graus por segundo junto com `trackingStatus` ate sair um numero `N`, contra o
   qual o design vira verificavel — *nenhuma mecanica pode exigir mais que N
   graus por segundo*. Enquanto `N` nao existir, isto e observacao, nao restricao.

**Fechados pela F2 (2026-08-19), com uma partida completa em device por cima
deles:** a ordem de carregamento do `window.BABYLON` (o `xr.js` saiu do
`index.html` e e injetado depois do shim por `src/ar/xr8Loader.ts`), o azimute 0
invertido em 180 graus (`atan2(x, z)`, corrigido em quatro lugares que precisavam
concordar), e a medicao de piso por `hitTest`, que saiu inteira do projeto.

**Deixou de ser bloqueador:** o deslize ao girar. Medido com laco fechado
(marcar, girar, voltar fisicamente ao ponto e ler o residuo) em 2026-08-19: a
mediana e de **7,5 cm** na varredura de flanco de +-90 graus, que e o envelope
real do jogo, porque o arco tem 180 graus. Os 0,78 m aparecem so no giro de 360
graus, que o design nao exige, e apontando para carpete liso. O numero antigo de
1,09 -> 2,9 m vinha de uma metrica que misturava deriva com deslocamento real do
jogador.

**Fechados em `e036b37`, todos confirmados em device:** o toque na carta em RA
(era descompasso de tamanho de canvas, nao `cameraToUseForPointers`), as
mensagens de status ilegiveis, e o Beat 5 nao intuitivo (virou aproximacao).
O historico completo esta em
[`docs/experimentos/demo-mundo-vivo.md`](docs/experimentos/demo-mundo-vivo.md).

### Entregue

Compila, com **236 testes** em 21 arquivos passando (2026-08-21). Ela foi de 253 (antes da F2)
para 180 — queda esperada, porque o que morreu testava medicao de piso e
suavizacao da pose do preview — e voltou a subir com a RA-F3/F4/F5, que trouxeram
o diff de observers de render, a normalizacao da altura declarada e a
concordancia entre o `facing` enviado ao engine e o azimute que o jogo consome. **O que
foi confirmado em device e o que so compila esta separado na tabela "Estado
atual" do diario** — consulte antes de assumir que algo funciona.

**Da v3 (Etapas 1 a 3, mais a estabilizacao de 2026-08-19):**

- **arco polar** (`src/arena/ArenaArc.ts`): setor, azimute, raio, enquadramento e
  escolha de setor de spawn, como logica pura com teste. `ARENA_ARC_DEG` e
  parametrizavel (decisao D7)
- **escala de sala**: 1 unidade Babylon = 1 metro nos dois modos
  (`src/arena/metrics.ts`); `AR_ARENA_SCALE` deixou de existir
- **a arena vive na origem** (F2, 2026-08-19): `arenaRoot` fica em `(0,0,0)` com
  rotacao identidade para sempre, e o piso e o `y = 0` do mundo porque a camera de
  RA nasce na altura declarada do jogador. **Confirmado em device**: a arena
  assentou no chao real sem `hitTest` nenhum. Substituiu a
  ancoragem egocentrica, que arrastava a arena pelo mundo
- **a arena e sempre nivelada pela gravidade** (2026-08-19). Ela copiava a normal
  medida do piso, com clamp de 12 graus — herança da arena de mesa de 80 cm, onde
  isso valia 8 cm. Num arco de 2,2 m de raio valia **47 cm**, e a medicao tem
  mediana de 13 graus de inclinacao e picos de 48: e ruido, nao geometria. A
  inclinacao continua sendo **medida** e vai para a telemetria, para a decisao
  poder ser derrubada por dado
- **telemetria da confirmacao**: `arena_placed` carrega `trackingStatus`. Ele ja
  carregou `deviceHeightM`, `floorY` e `tiltDeg`; as tres sairam com a medicao de
  piso que as produzia, junto com o evento `floor_fit_sample`. Reportar um numero
  que ninguem mede seria pior do que nao reportar

**Do prototipo table-scale (a v3 aposenta o modelo de jogo; a base de RA fica):**

- **partida completa com vitoria do jogador** (2026-08-14, Android/Chrome):
  ancorar, explorar, acordar o inimigo por aproximacao, jogar cartas e vencer
  por 98,1 x 0. Intervalo `arena_placed` -> `enemy_awakened` de **31,3 s** (a
  spec valida acima de 30 s) — **mas com o autor testando o proprio jogo**, o
  que nao vale como leitura da metrica
- **Beat 5 por APROXIMACAO** (`src/towers/ProximityTrigger.ts`): a batalha
  comeca quando o jogador chega a ~45 cm da caverna e sustenta por 0,8 s. Nao
  existe botao nem toque obrigatorio — tocar na torre continua funcionando como
  via secundaria. Os limiares saem de telemetria de device, nao de palpite
- **torres-cogumelo** (`src/towers/MushroomTower.ts`) com boca de caverna,
  nucleo de brilho, **halo aditivo** e olhos que acompanham a camera. O halo e
  o que faz a caverna chamar: blending aditivo soma luz ao feed em vez de
  ocupar o pixel
- **o coelho de cartola** (`src/towers/CrazyRabbit.ts`) que salta da caverna,
  traz a carta da IA e **fica morando ao lado da torre**, respirando
- **placa "CUIDADO"** (`src/towers/CautionSign.ts`) — a unica instrucao que a
  spec do Beat 4 permite, porque e cenario e nao HUD, e dimensionada para
  exigir aproximacao para ser lida

- **colocacao da arena por contorno fantasma** (`src/ar/ArenaGhost.ts`): o
  contorno real de 0,53 m x 0,80 m aparecia deitado na superficie e mudava de cor
  conforme dava para ancorar ali. **Confirmado em device no chao (2026-08-14):
  zero recusas, ancorou no primeiro toque.** *A F2 tirou o veredito do contorno:
  ele continua existindo, na origem, so para mostrar a extensao do arco.*
- **o gate de colocacao recusava por prova contraria, nao por falta de prova**
  (era `src/ar/placementGate.ts`, **removido na F2**): sonda de hitTest sem
  leitura nao reprovava nada; so reprovavam duas ou mais sondas que batessem em
  superficie real fora do plano (a borda da mesa). A politica anterior, que
  exigia confirmacao positiva, produziu 79 recusas e zero ancoragens em dois
  testes de device. **O aprendizado sobrevive ao codigo:** silencio de sensor nao
  e evidencia
- **partida completa de ponta a ponta rodando em device** (2026-08-14): ancorar,
  explorar, acordar o inimigo e chegar ao fim da partida
- arena de mesa metrica: 16 x 24 unidades autorais que em RA valem **0,53 m x 0,80 m**, com escala **fixa** (sem slider)
- **uma torre de cada lado** (`tower-blue-center` em z = -10, `tower-red-center` em z = +10) e **caminho central unico** (mundo x em [-2, 2]) atravessando a faixa de rio
- a superficie detectada e **medida** antes de ancorar: se nao couber a arena de 80 cm, o toque nao posiciona e o jogo pede uma superficie maior — a arena nunca e reescalada para caber
- **orientacao retrato travada** nos dois modos; paisagem saiu de escopo
- fase **`world-alive`** (Beat 4): depois de ancorar, a tela fica **completamente limpa** — sem HUD, sem timer, sem prompt, sem barra de vida
- **comportamento ocioso** procedural das criaturas: parado, vagando, observando (cabeca acompanha a camera) e social, com respiracao continua e fases dessincronizadas
- `WorldTapRouter` como dono unico do toque, roteando por fase
- **HUD retrato minimo**: HP das torres e timer no topo, cogumelos e 4 cartas no terco inferior; debug so com `?debug=1`
- **carta que nao da para pagar responde**: tocar nela pulsa o anel de cogumelos. A recusa era silenciosa, e recusa silenciosa le como carta quebrada
- **invocacao em dois toques**: a metade do jogador acende, fantasma de ~200 ms, e toque fora cancela sem gastar cogumelo
- **partida de 3 min** por relogio de parede (nunca pausa), cogumelo dobrado no ultimo minuto, IA por script fixo, desempate por percentual de HP
- **fim de partida**: a arena se desfaz da borda para o centro, sem tela de resultado
- **instrumentacao de sessao** (`src/telemetry/`) com os eventos do teste e export do JSON com `?debug=1`
- 4 criaturas jogaveis (Javali 2, Tatu Bola 3, Dona Barata 4, Cururu 5) com materiais mate e paleta limitada
- indicador direcional para o que acontece fora do quadro
- modo RA no engine 8th Wall (SLAM via camera), com suporte a iOS
- tela inicial escolhendo o modo (RA ou tela) antes da partida
- calibracao de escala absoluta obrigatoria antes de ancorar, guiada pelo coaching overlay oficial do 8th Wall

## Diarios de experimento

Cada linha de investigacao tem um diario em [`docs/experimentos/`](docs/experimentos/README.md)
— o que foi tentado, o que cada tentativa provou e o que ainda esta aberto,
inclusive as conclusoes que foram desmentidas depois:

- [`arena-180-atencao.md`](docs/experimentos/arena-180-atencao.md) — **o diario
  ativo**: a v3, e se a RA da para ser mecanica em vez de cenografia;
- [`demo-mundo-vivo.md`](docs/experimentos/demo-mundo-vivo.md) — **encerrado por
  mudanca de direcao (2026-08-17)**; continua sendo o historico de RA do projeto
  (calibracao, gate de colocacao, armadilhas de GUI);
- [`ra-e-paisagem.md`](docs/experimentos/ra-e-paisagem.md) — estabilidade da arena
  em RA e orientacao de tela;
- [`ferramental-de-sessao.md`](docs/experimentos/ferramental-de-sessao.md) — como
  o projeto registra o proprio progresso entre sessoes.

Os diarios sao escritos pela skill `encerrar-sessao`
(`.claude/skills/encerrar-sessao/SKILL.md`), acionada ao fim de cada sessao.

## Layout (retrato)

O jogo e desenhado para ser segurado com uma mao, em pe:

- a arena ocupa o quadro inteiro; o HUD flutua sobre ela;
- **topo**: HP numerico das duas torres e o timer da partida;
- **terco inferior** (zona do polegar): contador de cogumelos imediatamente
  acima da fileira de 4 cartas;
- fora da partida — e principalmente na fase `world-alive` — **nao existe HUD
  nenhum na tela**;
- diagnostico so com `?debug=1`.

## Tela cheia e orientacao

A politica e **retrato travado, para os dois modos**. Ela deixou de ser por modo
de jogo quando a spec da demo tirou paisagem de escopo.

- O modo imersivo (`requestFullscreen` + `screen.orientation.lock("portrait-primary")`)
  e pedido **antes** de subir a sessao de RA, nunca com ela no ar: com a sessao
  ativa isso redimensiona o canvas e reprojeta a cena no meio do tracking.
- Quem aplica a politica e o `GameFlow`; o `enterAR()` nao mexe mais em
  orientacao.
- `src/main.ts` chama `engine.resize()` durante a sessao de RA **apenas quando o
  canvas CSS e o tamanho de render divergiram** alem de 2 px. A regra anterior
  era "nunca redimensionar durante a RA", e ela estava certa pelo motivo dela (o
  engine do 8th Wall detecta canvas sozinho, e reprojetar no meio do tracking e
  ruido) — mas nao previu que `engine.resize()` e o **unico gatilho** de
  `engine.onResizeObservable`, que e onde o `AdvancedDynamicTexture` de tela
  cheia recalcula o proprio tamanho. Sem ele, a textura do HUD congela no
  tamanho antigo e **os controles aparecem sem responder ao toque**. Detalhe e
  a prova em device no achado 1 da entrada `e036b37` de
  [`docs/experimentos/demo-mundo-vivo.md`](docs/experimentos/demo-mundo-vivo.md).
- Onde `screen.orientation.lock` nao existe (Safari do iPhone), um overlay CSS
  incondicional pede retrato — sem depender de JS, antes mesmo da cena carregar.
- No Safari do iPhone nao existe Fullscreen API: a tela cheia de verdade so
  acontece com **Compartilhar > Adicionar a Tela de Inicio** (o
  `manifest.webmanifest` e as metas `apple-mobile-web-app-*` fazem o atalho abrir
  em retrato, sem barras do Safari).
- Historico de por que paisagem foi abandonada, e o que continua sem veredito,
  em [`docs/experimentos/ra-e-paisagem.md`](docs/experimentos/ra-e-paisagem.md).

## Realidade Aumentada (8th Wall)

- O modo RA usa o engine 8th Wall (`@8thwall/engine-binary`), que roda em qualquer navegador mobile (iOS Safari incluido) — WebXR nao e mais utilizado.
- Os artefatos do engine sao copiados de `node_modules` para `public/8thwall/` automaticamente no `npm install` (script `postinstall`).
- **A arena e autorada na origem e nunca se move.** `arenaRoot` fica em
  `(0,0,0)` com rotacao identidade para sempre; o jogador e o vertice do arco,
  logo o jogador **e** a origem. O azimute 0 e o `+Z` do mundo. Mundo em metros,
  escala absoluta, `arenaRoot.scaling` sempre 1.
- **A cena e CANHOTA, e tem de continuar assim.** O ramo destro do modulo Babylon
  deste build do engine produz quaternion NaN — pose morta, tela preta. O
  comentario em `src/ar/arenaHeading.ts` que manda ligar `useRightHandedSystem`
  esta errado e e perigoso.
- **A arena e sempre nivelada pela gravidade.** Ela ja copiou a normal medida do
  fit de plano, com clamp de 12 graus; isso foi removido em 2026-08-19 porque, num
  arco de 2,2 m de raio, os 12 graus valem 47 cm — e a normal medida tem mediana
  de 13 graus e picos de 48, ou seja e ruido. A inclinacao continua sendo medida
  e registrada na telemetria, nunca aplicada na cena.
- **O piso e DECLARADO, nao medido** — mas a explicacao de COMO isso funciona
  estava errada, e o device de 2026-08-20 corrigiu. A arena assenta no chao real
  sem medir nada, e o pipeline de fit de plano (`placementGate`, `floorEstimate`,
  `hitTestSampling`) continua fora do projeto.

  O que mudou: **a altura declarada nao chega ao engine**. Em `scale: "absolute"`
  o 8th Wall sobrescreve `origin.y` para **1 m** — quatro colocacoes com 1,55
  declarado deram distancia camera-origem de 1,0049 / 0,9797 / 1,0134 / 1,0043.
  O piso cai em `y = 0` porque o engine assume o celular a 1 m do chao no instante
  da colocacao, e nao por causa do numero que o projeto declarava. O 1,55 de
  2026-08-19 nunca esteve agindo: a arena assentou porque quem coloca esta
  olhando para o chao, com o celular perto de 1 m.

  Consequencia pratica: **quem coloca a arena define o piso pela altura em que
  segura o celular.** Detalhe e numeros na hipotese 8 de
  [`arena-180-atencao.md`](docs/experimentos/arena-180-atencao.md).
- **`hitTest` sai do caminho critico.** O aprendizado sobre `FEATURE_POINT`
  (remove-lo deixava o sensor mudo) continua valido para quem for usar `hitTest`
  para consulta pontual de geometria, mas ele deixa de ser fundacao de
  ancoragem.
- Antes de comecar, o jogador ve o **arco real** deitado no piso, centrado nele.
  O toque **nao pode ser recusado**. Desde a RA-F4 ele tambem **escolhe a
  direcao**: o gesto chama `XR8.XrController.recenter()`, e o azimute 0 do arco
  passa a ser para onde o celular aponta no instante do toque. Por `DR-3` isso
  entra como transicao de fase — a arena sai de cena, o coaching overlay volta, e
  o mundo so e devolvido quando o tracking estiver `NORMAL` de novo.
  **Implementado; nao testado em device.**
- **O controle de altura declarada existe no codigo e VAI SAIR.** Ele foi
  escrito na RA-F3 e o device de 2026-08-20 o derrubou no mesmo dia: o engine
  ignora o numero. Somado a decisao de que altura do jogador nao deve ser campo
  de tela, os dois `HeightStepper` saem junto com o HUD 2D, na JG-07. A
  normalizacao em `src/ar/playerHeight.ts` fica, porque `origin` nao-finito
  contamina o frame do engine de forma permanente e a guarda continua valendo.
- **A arena vive na origem do mundo e nunca se move.** Em todo codigo oficial do
  8th Wall o conteudo fica em coordenadas autorais fixas, e quem se move e a
  origem da camera, via `recenter()`. Como o jogador e o vertice do arco, ele
  **e** a origem: ancorar e reposicionar viram o mesmo gesto.
- **O gate de colocacao deixa de existir.** Com o piso declarado nao ha o que
  reprovar. O aprendizado que o produziu continua valendo em geral — silencio de
  sensor nao e evidencia, e gate por prova positiva recusou 79 toques sem ancorar
  uma vez — mas nao ha mais gate neste projeto.
- A orientacao de tela nao e mais responsabilidade do AR Manager: quem aplica a
  politica e o `GameFlow`, **antes** de subir a sessao. Com a sessao no ar nao se
  pede tela cheia nem `screen.orientation.lock` — as duas coisas redimensionam o
  canvas e reprojetam a cena no meio do tracking.
- **O `xrCameraBehavior` chama `XR8.run()` e `XR8.stop()` por voce** (lido no
  bundle em 2026-08-19). O `attach` termina em
  `XR8.run({ canvas, ownRunLoop: false, ... })`; o `detach` faz `XR8.stop()` +
  `XR8.clearCameraPipelineModules()`. Esse `clear` **nao era** o culpado da
  segunda sessao nao subir (ele e simetrico: o `enterAR` seguinte re-adiciona os
  modulos) — o culpado eram os observers de render que o `attach` registra e o
  `detach` nao remove. Duas afirmacoes que ja estiveram aqui e estao **erradas**:
  "o projeto nunca chama `run`/`stop`" e "o suspeito e o `clear`".
- **Circular a arena funciona so em partes.** Confirmado em device
  (2026-08-12): passar para **tras** da arena faz a camera enquadrar area que o
  SLAM ainda nao mapeou, e o conteudo comeca a driftar. Esta em investigacao —
  ver a hipotese 4 em
  [`docs/experimentos/ra-e-paisagem.md`](docs/experimentos/ra-e-paisagem.md).
- Como a escala e absoluta, ela so converge depois que o SLAM ganha paralaxe. O
  posicionamento so libera com `trackingStatus === "NORMAL"` — o criterio oficial
  de "calibrado", o mesmo que o coaching overlay do 8th Wall usa para sumir da
  tela. Em ambiente com pouca textura ha um escape: apos 30s preso em `LIMITED`
  o toque libera com aviso de precisao reduzida.
- O coaching overlay (`@8thwall/coaching-overlay`, MIT) e carregado por
  `<script>` e copiado para `public/coaching-overlay/` no mesmo `postinstall`.
- O binario possui licenca de uso limitado (ver `node_modules/@8thwall/engine-binary/LICENSE`).

## Roadmap de Fases

> **Esta tabela descreve o prototipo table-scale, nao a v3.** Ela continua valendo
> como estado do codigo que existe hoje. O roadmap vigente e o quadro em
> [`docs/specs-arena-180/README.md`](docs/specs-arena-180/README.md), e a Fase 03
> (som) deixou de ser opcional la: na v3, ouvir o que nao se ve e mecanica, nao
> charme — e o projeto continua **sem modulo de audio**.

| Concluida | Fase | Tarefa | Objetivo |
| --- | --- | --- | --- |
| [~] | 01 | POC | AR mode, Arena com escala, posicionar tropas — **posicionar a arena e posicionar tropas funcionam** (confirmado em device 2026-08-14; duas invocacoes registradas na telemetria); falta veredito em **mesa**, e o criterio de deslize continua **nao medido** depois da arena virar 80 cm |
| [x] | 02 | Inimigos | Bot inimigo por **script fixo** (`src/battle/EnemyScript.ts`) — confirmado em device nos dois sentidos: a IA venceu uma partida e perdeu outra |
| [0] | 03 | Sons e Musica | Adicionar musica de fundo e sons para ataques. **Ha um pedido especifico esperando aqui:** o chamado sonoro da caverna ("psiu psiu"), que hoje so existe em versao visual pelo halo. Recomendacao do diario: fazer so o `Sound` posicional da caverna antes de abrir a fase inteira |
| [x] | 04 | Tela inicial e Final game | Menu inicial entregue; o fim de partida virou a **dissolucao da arena** (a spec da demo proibe tela de resultado) — confirmado em device |

## Criterio de Conclusao da Fase 01

> Criterios do prototipo table-scale. O ultimo item (deslize circulando) foi
> **aposentado pela v3**, que proibe deslocamento — ver o bloqueador 3 acima.

- Arena ancorada em RA com estabilidade visual. **Ancorar funciona no chao**
  (device, 2026-08-14); em mesa, sem veredito.
- Sem jitter perceptivel durante movimentos naturais do dispositivo.
- Entrada e saida do modo RA sem perder posicionamento da arena. **Destravado em
  2026-08-20** (a segunda sessao sobe); o que ainda falta e repetir cinco vezes
  seguidas. Ficou bloqueado ate 2026-08-19, quando o sintoma foi visto por
  inteiro: a segunda entrada ficava so no loader, sem overlay e sem arena.
  *Note que "perder posicionamento" deixou de fazer sentido desde a F2 — a arena
  esta sempre na origem; o que se perde e a sessao, nao a posicao.*
- **Deslize de no maximo ~2 cm com o celular circulando a mesa por 60 s** (o
  criterio do Beat 3 da spec da demo). **Ainda nao medido** depois da arena
  passar a ter 80 cm com escala fixa. O usuario relatou (2026-08-14, no chao)
  que "indo devagar da para dar a volta na arena" — encorajador, mas nao e
  medicao. Deixou de ser criterio de conforto: o Beat 5 agora **exige** que o
  jogador chegue a ~45 cm da torre inimiga, entao estabilidade em aproximacao
  virou requisito do funil.

## Como Rodar

- Instalar dependências:

```bash
npm install
```

- Executar em desenvolvimento:

```bash
npm run dev
```

O dev server roda em HTTPS (certificado autoassinado) porque o acesso a camera exige contexto seguro. Para testar no celular, acesse `https://<ip-da-maquina>:5173` na mesma rede e aceite o aviso de certificado.

- Build de produção:

```bash
npm run build
```
