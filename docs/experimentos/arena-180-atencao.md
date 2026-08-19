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
| Ancoragem egocentrica (Etapa 3) | **Implementada e em device** — ancora, mas ver as duas linhas abaixo |
| Arco do preview tremendo/inclinando | **RESOLVIDO**, confirmado em device 2026-08-19 |
| Medicao do piso | **QUEBRADA**. `spreadM` mediano de 32 cm; 12 recusas seguidas por `bad-height` com o jogador de pe. Endereçada pela [spec 07](../specs/07-calibracao-manual-do-piso.md), nao iniciada |
| Deslize girando no lugar | **MEDIDO, e ruim**: 1,09 m -> 2,9 m sob `NORMAL` num giro de 360 graus, chegando a 4,47 m em `LIMITED` |
| Ondas convergindo ao jogador (Etapa 4) | **Nao iniciada** |
| Alertas de flanco e audio (Etapa 5) | **Nao iniciados**; o projeto continua **sem modulo de audio** |
| Colocacao com anel, cartas, caldeirao, album (6-11) | **Nao iniciadas** |
| Segunda sessao de RA sem recarregar | **Quebra** — herdado, nunca tocado |

## Hipoteses vivas

Em ordem de suspeita, com o teste que decide cada uma.

1. **A tese central pode simplesmente nao ser divertida.** Girar para cobrir tres
   flancos com um par de olhos pode ler como trabalho, nao como jogo — e nada no
   plano prova o contrario antes da Onda 6.
   **Teste:** as Etapas 1-7 jogaveis em device, com alguem que nao conhece o
   jogo, medindo se a pessoa gira por curiosidade ou so quando a seta manda. A
   propria spec §12 nomeia esse corte: "passos 1-4 provam a tese; se a mecanica
   de atencao nao for divertida ali, o resto nao salva".

2. **RESPONDIDA EM 2026-08-19, e a resposta e ruim.** A hipotese era que ficar
   parado perto da origem deixaria o VIO mais estavel. Medido: um giro de 360
   graus com o jogador **parado** afastou a arena de 1,09 m para 2,9 m ainda sob
   `trackingStatus: NORMAL`, e para 4,47 m depois de cair para `LIMITED`. O
   criterio proposto era ~2 cm.
   **O que continua aberto:** se a varredura de calibracao da Onda 4 (mapear os
   flancos antes da partida) reduz isso a um numero jogavel, e se D7 — cair para
   120 graus — vira necessidade em vez de valvula. **Nao existe hoje nenhuma
   correcao para drift sob `NORMAL`**: a reancoragem so dispara em
   `LIMITED -> NORMAL`.

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

6. **A segunda sessao de RA falha porque o engine nunca para.** Hipotese herdada
   do diario encerrado, com o diagnostico completo la: o projeto nunca chama
   `XR8.run()`/`XR8.stop()`, e o ciclo de vida inteiro esta delegado ao
   `xrCameraBehavior`.
   **Teste:** `?debug=1`, entrar na RA, sair, entrar de novo e olhar o
   `trackingStatus`. Se na primeira sessao ele progride e na segunda fica
   `null`, esta confirmada. Enderecada pela Etapa 11 do plano.

## Proximos passos

O plano de 11 etapas continua valendo para o **jogo**, mas a Onda 3 dele esta
suspensa ate a ancoragem voltar a funcionar: nao adianta validar deslize num
setup em que o jogador nao consegue ancorar.

**1. Onda 3 da [spec 07](../specs/07-calibracao-manual-do-piso.md) — altura
manual do piso.** Etapa 6 (`floorCalibration.ts`) e Etapa 7 (arrasto no
`WorldTapRouter`) em paralelo, arquivos disjuntos; depois a Etapa 8 (fiacao e
poda do gate), serial. **Nada disso comecou.**

**2. Device.** Ancorar, ficar parado 30 s, girar 360 graus, exportar. As cinco
perguntas estao na Etapa 9 da spec 07. A quarta — quanto a arena anda no giro —
e a linha de base da Onda 4.

**3. Onda 4 — raio ajustavel, varredura dos flancos e fronteira viva.** So depois
que ancorar funcionar, para que um resultado ruim aponte uma causa so.

**4. Depois disso, retomar a Etapa 4 do plano** (diretor de ondas) e seguir para
a validacao da tese com alguem de fora, que continua sendo o corte que decide o
resto do projeto.

**Divida tecnica nomeada, fora do caminho critico:** `scene.useRightHandedSystem`
nao e ligado em lugar nenhum, apesar de `src/ar/arenaHeading.ts` afirmar que
`src/main.ts` liga. A cena e canhota, entao "azimute positivo = direita do
jogador" e, na verdade, a esquerda. Hoje o erro se cancela — o desenho do arco e
a medicao do yaw estao espelhados os dois, e `framedSectors` acerta. Ele deixa de
se cancelar no instante em que algo disser a palavra "esquerda" para o jogador,
ou seja na Etapa 5 (alertas de flanco).
