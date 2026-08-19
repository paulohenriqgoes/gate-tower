# Tower Gate

Jogo de cartas em Realidade Aumentada (RA), jogado de pe, com o celular na mao:
o jogador e o vertice de um arco de 180 graus e defende tres flancos com um campo
de visao que cobre so um deles por vez. **Atencao — para onde o celular esta
apontado — e o recurso escasso.**

A leitura de campo do Clash Royale continua sendo a referencia de origem, mas as
lanes sairam de escopo na v3: nao ha caminho, e a tropa nasce onde o jogador
apontou.

## Estado Atual

**Foco atual: executar a v3 — arena de 180 graus e atencao como recurso.**
A [spec v3](docs/guias/tower_gate_spec_v3.md) (2026-08-17) parte de um
diagnostico duro do prototipo atual: travando a camera e trocando por uma camera
3D comum, **o jogo nao muda** — nada no gameplay depende da pose do dispositivo,
e a RA e cenografia cara. A v3 transforma enquadramento em recurso escasso: ~60
graus de campo de visao para cobrir um arco de 180, com dois tercos sempre cegos.

Com isso morrem a arena de mesa, o caminho unico central e o HUD 2D de combate.
O plano de execucao esta em
[`docs/guias/tower_gate_v3_plano_etapas.md`](docs/guias/tower_gate_v3_plano_etapas.md)
— 11 etapas em 9 ondas. **As Etapas 1, 2 e 3 estao implementadas e foram a
device.** A investigacao vive em
[`docs/experimentos/arena-180-atencao.md`](docs/experimentos/arena-180-atencao.md).

**A fundacao de RA foi refeita do zero em 2026-08-19, depois de ler o codigo
oficial do 8th Wall.** O projeto media o chao com `hitTest`; o engine espera que
voce o **declare**. O exemplo oficial de world tracking nao chama `hitTest`
nenhuma vez: ele poe conteudo em `y = 0` e declara a posicao inicial da camera
com `XR8.XrController.updateCameraProjectionMatrix({ origin, facing })`. Se
`origin.y` for a altura do jogador, o piso cai em `y = 0` de graca.

O plano executavel esta em
[`docs/specs/08-fundacao-ar.md`](docs/specs/08-fundacao-ar.md) e **nao comecou**.
Ele **substitui a spec 07**, que tentava consertar a medicao de piso e ficou
obsoleta sem nunca ter comecado.

A demo do mundo vivo foi **encerrada por mudanca de direcao**, nao por resposta:
a pergunta dela nunca chegou a ser medida com alguem de fora, e o palco em que
ela media saiu de escopo.

### Bloqueadores conhecidos (2026-08-19, vistos em device)

Leia isto antes de mexer em qualquer coisa:

1. **`window.BABYLON` e instalado tarde demais.** O bundle constroi
   `XR8.Babylonjs` no carregamento do `xr.js` e so cria os temporarios internos
   dele `if (window.BABYLON)`. O projeto instala o shim dentro de `enterAR()`,
   depois do script `async` — entao esses temporarios ficam `undefined` para
   sempre. Hoje isso e invisivel porque a cena e canhota e o caminho canhoto nao
   os usa, mas e uma bomba armada. Conserto na F2 da
   [spec 08](docs/specs/08-fundacao-ar.md).
2. **Ligar `scene.useRightHandedSystem` quebra a RA inteira.** O ramo destro do
   modulo Babylon deste build produz quaternion **NaN**: a pose morre e a tela
   fica preta sobre o feed da camera. Confirmado em device em 2026-08-19.
   **`src/ar/arenaHeading.ts:26` manda ligar essa flag e afirma que `main.ts` ja
   liga — as duas coisas sao falsas.** Nao siga esse comentario; ele sai na F2.
3. **O azimute 0 esta 180 graus invertido.** `headingDegFromForward` usa
   `atan2(x, -z)` (frente = `-Z`, convencao destra), mas a frente do runtime
   canhoto e `+Z`. O sinal esta certo; o zero nao. Como `relativeYawDeg` e uma
   subtracao, o erro **cancela** em medidas relativas — por isso a selecao de
   setor pode estar acertando por acidente. Conserto na F2.
4. **Nao da para entrar numa segunda sessao de RA sem recarregar a pagina** (bug
   antigo, **nao tocado ate hoje**). A hipotese registrada antes — "o projeto
   nunca chama `XR8.run()` nem `XR8.stop()`" — esta **errada**: o
   `xrCameraBehavior` chama os dois. O suspeito e o
   `XR8.clearCameraPipelineModules()` que o `detach` executa. Endereçado pela F5
   da spec 08, com `XR8.reconfigureSession()`.
5. **Colocar a arena numa mesa/bancada** ficou **sem veredito para sempre**: a v3
   aposentou a pergunta, porque a arena nasce no chao ao redor do jogador.

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

Compila, com **253 testes** de logica pura passando. **O que foi confirmado em
device e o que so compila esta separado na tabela "Estado atual" do diario** —
consulte antes de assumir que algo funciona.

**Da v3 (Etapas 1 a 3, mais a estabilizacao de 2026-08-19):**

- **arco polar** (`src/arena/ArenaArc.ts`): setor, azimute, raio, enquadramento e
  escolha de setor de spawn, como logica pura com teste. `ARENA_ARC_DEG` e
  parametrizavel (decisao D7)
- **escala de sala**: 1 unidade Babylon = 1 metro nos dois modos
  (`src/arena/metrics.ts`); `AR_ARENA_SCALE` deixou de existir
- **ancoragem egocentrica**: a arena nasce no jogador, com o azimute 0 na direcao
  do celular no fechamento. **Ancora em device**, mas ver o bloqueador 1
- **a arena e sempre nivelada pela gravidade** (2026-08-19). Ela copiava a normal
  medida do piso, com clamp de 12 graus — herança da arena de mesa de 80 cm, onde
  isso valia 8 cm. Num arco de 2,2 m de raio valia **47 cm**, e a medicao tem
  mediana de 13 graus de inclinacao e picos de 48: e ruido, nao geometria. A
  inclinacao continua sendo **medida** e vai para a telemetria, para a decisao
  poder ser derrubada por dado
- **a pose do arco e filtrada** (`src/ar/poseSmoothing.ts`, `src/ar/floorEstimate.ts`):
  suavizacao exponencial independente de frame rate com snap em salto de
  relocalizacao. **Confirmado em device: o arco parou de pular**
- **telemetria da ancoragem**: `arena_placed` carrega `trackingStatus`,
  `deviceHeightM`, `floorY` e `tiltDeg`; o evento `floor_fit_sample` registra a
  qualidade da medicao de piso

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
  contorno real de 0,53 m x 0,80 m aparece deitado na superficie e muda de cor
  conforme da para ancorar ali, antes do toque. O toque so confirma. **Confirmado
  em device no chao (2026-08-14): zero recusas, ancorou no primeiro toque**
- **o gate de colocacao recusa por prova contraria, nao por falta de prova**
  (`src/ar/placementGate.ts`): sonda de hitTest sem leitura nao reprova nada;
  so reprovam duas ou mais sondas que batam em superficie real fora do plano
  (a borda da mesa). A politica anterior, que exigia confirmacao positiva,
  produziu 79 recusas e zero ancoragens em dois testes de device
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
- **A arena nasce no jogador, nao num ponto tocado do chao.** A origem e o
  celular projetado no piso e o azimute 0 e a direcao em que ele aponta no
  fechamento; o toque so diz "agora". Mundo em metros, escala absoluta,
  `arenaRoot.scaling` sempre 1.
- **A cena e CANHOTA, e tem de continuar assim.** O ramo destro do modulo Babylon
  deste build do engine produz quaternion NaN — pose morta, tela preta. O
  comentario em `src/ar/arenaHeading.ts` que manda ligar `useRightHandedSystem`
  esta errado e e perigoso.
- **A arena e sempre nivelada pela gravidade.** Ela ja copiou a normal medida do
  fit de plano, com clamp de 12 graus; isso foi removido em 2026-08-19 porque, num
  arco de 2,2 m de raio, os 12 graus valem 47 cm — e a normal medida tem mediana
  de 13 graus e picos de 48, ou seja e ruido. A inclinacao continua sendo medida
  e registrada na telemetria, nunca aplicada na cena.
- **O piso e DECLARADO, nao medido** (decisao de 2026-08-19; implementacao na F2
  da [spec 08](docs/specs/08-fundacao-ar.md)). `origin.y` da
  `XR8.XrController.updateCameraProjectionMatrix` define onde a camera comeca na
  cena; com ele igual a altura do jogador, o piso e `y = 0` por construcao. E o
  que o exemplo oficial de world tracking do 8th Wall faz, e ele **nao chama
  `hitTest` nenhuma vez**. Todo o pipeline de fit de plano (`placementGate`,
  `floorEstimate`, `hitTestSampling`) sai do projeto.
- **`hitTest` sai do caminho critico.** O aprendizado sobre `FEATURE_POINT`
  (remove-lo deixava o sensor mudo) continua valido para quem for usar `hitTest`
  para consulta pontual de geometria, mas ele deixa de ser fundacao de
  ancoragem.
- Antes de ancorar, o jogador ve o **arco real** deitado no piso estimado,
  centrado nele e girando junto. **O toque so confirma o que o contorno mostra**:
  ele nao mede nada por conta propria.
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
  `XR8.clearCameraPipelineModules()` — e e esse `clear` o suspeito da segunda
  sessao nao subir. A afirmacao anterior aqui ("o projeto nunca chama `run`/`stop`")
  estava **errada** e mandava quem investigasse para o lugar errado.
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
> como estado do codigo que existe hoje. O roadmap vigente e o plano de 11 etapas
> em [`docs/guias/tower_gate_v3_plano_etapas.md`](docs/guias/tower_gate_v3_plano_etapas.md),
> e a Fase 03 (som) deixou de ser opcional la: na v3, ouvir o que nao se ve e
> mecanica, nao charme.

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
- Entrada e saida do modo RA sem perder posicionamento da arena. **Bloqueado**
  pelo bug da segunda sessao de RA (bloqueador 1).
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
