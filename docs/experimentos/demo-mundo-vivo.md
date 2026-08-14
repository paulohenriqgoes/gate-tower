# Experimento: a demo do mundo vivo

Diario da demo que existe para responder **uma unica pergunta**, com pessoas
reais testando: *a pessoa acredita que apareceu um mundo vivo na mesa dela?*
Registra o que foi construido para responder isso, o que o primeiro teste em
device mostrou, e o que continua aberto. Ultima atualizacao: **2026-08-14**.

## Objetivo

A demo nao valida mecanica de batalha, balanceamento, economia nem progressao.
Ela mede **comportamento observavel**: quanto tempo a pessoa fica no beat 4 (o
mundo vivo, sem HUD), o quanto ela se aproxima da arena, e se ela trata as
criaturas como seres.

A metrica principal e o intervalo entre `arena_placed` e `enemy_awakened`.
Abaixo de 5 s o mundo nao convenceu; acima de 30 s, validado.

Duas tensoes que puxam em direcoes opostas:

- o **beat 4** exige tela completamente limpa, sem HUD, sem timer, sem prompt e
  **sem instrucao** — a spec e explicita: "nao instruir; se ela nao se aproxima
  sozinha, e resultado do teste, nao falha do teste";
- a **usabilidade** do que vem antes (colocar a arena) e depois (a batalha)
  precisa funcionar sem instrucao nenhuma, senao a pessoa nunca chega ao beat 4
  ou trava logo depois dele.

O primeiro teste em device mostrou que a segunda tensao e onde a demo esta
perdendo.

## Linha do tempo

### (sem commit) — construcao da demo em 11 etapas (2026-08-12)

**Feito:** implementacao do recorte inteiro da spec da demo (P0 e P1), em ondas
paralelas de sub-agents, com o formato da skill `planejamento-por-etapas`:

- orientacao **retrato travada** nos dois modos; a camada landscape-first saiu
  do codigo (detalhe e evidencia em `ra-e-paisagem.md`);
- **arena de mesa**: 16x24 unidades autorais, `AR_ARENA_SCALE = 0.8/24`, ou seja
  0,53 m x 0,80 m; **uma torre por lado** (z = +-10) e **caminho central unico**;
  o slider de escala manual foi removido (a escala virou constante);
- `SessionTelemetry` com os eventos da secao 7 da spec, amostragem de distancia
  de camera a cada 500 ms e export do JSON com `?debug=1`;
- **comportamento ocioso** procedural (`src/units/idle/IdleBehavior.ts`): quatro
  estados (parado, vagando, observando, social), respiracao contínua sobreposta,
  transicoes sorteadas entre 2 e 6 s com offset de fase por criatura, e peso
  maior para "observando" (a cabeca acompanhando a camera);
- fase **`world-alive`** e `WorldTapRouter` como dono unico de
  `scene.onPointerObservable` (antes o AR Manager e o Combat Engine disputavam o
  mesmo evento); o Beat 5 virou o toque na torre inimiga, e o botao "Comecar"
  deixou de existir;
- **HUD retrato** em duas zonas (HP + timer no topo, cogumelos + cartas no terco
  inferior), com o texto de debug atras de `?debug=1`;
- **invocacao em dois toques** com zona valida acesa, fantasma de ~200 ms e
  cancelamento que nao gasta cogumelo;
- **partida de 3 min** por relogio de parede (nunca pausa), cogumelo dobrado no
  ultimo minuto, `ENEMY_SCRIPT` fixo e deterministico, desempate por percentual
  de HP;
- **dissolucao da arena** ao fim, escalonada da borda para o centro, sem tela de
  resultado;
- quarta criatura (Tatu Bola, custo 3), `CARD_CATALOG` e `PALETTE` mate.

Verificacao automatizada ao fim: `npx tsc --noEmit` limpo, `npm test` com 111
testes passando, `npm run build` sem erro. Isso sustenta **"compila e a logica
pura testada passa"** — e nada alem disso.

**Resultado em device (2026-08-12, testado pelo usuario em celular com RA e no
desktop sem RA):**

O que funcionou:

- **explorar a arena funciona nos dois modos** (RA e tela);
- **a estetica das criaturas agradou** — foi o ponto elogiado espontaneamente;
- **a partida chega ao fim e a dissolucao da arena funciona.** Com o jogador sem
  poder jogar (ver bug 1), a IA destruiu a torre do jogador, o fim de partida
  disparou e a arena se desfez. O usuario descreveu a animacao como "muito boa".
  Isso valida em device, de uma vez: o `EnemyScriptRunner`, a condicao de
  vitoria por torre destruida, a fase `match-over` e o Beat 7 — que ate esta
  observacao estavam registrados apenas como "compila".

O que quebrou ou ficou ruim, na ordem em que atrapalha:

1. **As cartas nao aparecem quando a batalha comeca.** A IA comecou a atacar e
   nao havia como jogar. Bug bloqueante: sem carta, nao existe batalha.

2. **Nao da para entrar numa segunda sessao de RA sem recarregar a pagina.**
   Bug **antigo e recorrente**, que o usuario relata esquecer entre sessoes —
   por isso esta sendo registrado agora. Observado no fim do ciclo completo:
   depois da dissolucao, ao escolher RA de novo, **a camera liga e mais nada
   acontece** — nao aparece o alvo de ancoragem, e o loading de setup fica na
   tela. Recarregar o app resolve.
3. **Colocar a arena em RA ficou ruim.** Depois de calibrar, tocar no lugar
   escolhido **nao coloca** a arena; so depois de insistir com varios toques ela
   vai. O aviso de "aponte para uma superficie maior" aparece, mas **nao ajuda**:
   nao ha como saber se o espaco esta adequado ou nao. Marcado pelo usuario como
   ponto de revisao.
4. **O Beat 5 nao e intuitivo.** So foi possivel iniciar a partida indo **atras**
   da torre inimiga e clicando nela por tras.
5. **A arena aparece "muito seca".** Falta um processo de nascimento; o
   surgimento atual nao entrega o momento.
6. **Andar em volta da arena funciona so em partes.** Ir para tras da torre
   inimiga foi um desafio: a camera passa a mostrar area que o SLAM ainda nao
   mapeou e o conteudo comeca a driftar. Detalhe e hipoteses em
   `ra-e-paisagem.md`.

**Provou:**

1. **Verificacao automatizada nao diz nada sobre jogabilidade.** `tsc` limpo,
   111 testes passando e build ok conviveram com um bug que impede jogar (as
   cartas nunca renderizando). Os testes deste projeto cobrem logica pura; nenhum
   deles instancia o HUD. A licao operacional: **numero de teste verde nao e
   proxy de "a demo roda"** — so o device diz isso, e nao so para RA, mas para
   HUD tambem.

2. **A causa do bug das cartas e uma unidade que nao existe no Babylon GUI.**
   `src/ui/CardDeckHud.ts:83` faz `this.cardRow.height = "auto"`. O Babylon GUI
   nao tem unidade `auto`: `ValueAndUnit._Regex` (`/(^-?\d*(\.\d+)?)(%|px)?/`)
   casa **string vazia** contra `"auto"`, e `parseFloat("")` devolve `NaN` — a
   fileira de cartas fica com altura NaN e nao renderiza. Verificado rodando o
   regex do proprio `node_modules/@babylonjs/gui/2D/valueAndUnit.js` contra a
   string `"auto"`. **Nao e um erro de layout, e um valor invalido aceito em
   silencio** — o Babylon nao lanca, nao avisa, e o `tsc` nao pega porque
   `height` e `string`.

3. **A sessao de RA nunca e realmente encerrada — e nunca foi.** O projeto
   **nao chama `XR8.run()` nem `XR8.stop()` em lugar nenhum** (verificado por
   busca em `src/ar/` e `src/types/xr8.d.ts`): todo o ciclo de vida esta
   delegado ao `xr8.Babylonjs.xrCameraBehavior`, que e adicionado a uma
   `FreeCamera` no `enterAR` e removido junto com o `dispose()` dela no
   `exitAR`. Ou seja, "sair da RA" hoje significa **soltar a camera do Babylon**,
   nao parar o engine. Isso e coerente com o sintoma exato relatado: na segunda
   entrada a **camera continua ligando** (o pipeline do 8th Wall nunca parou)
   mas **nada mais acontece**. Isto nao prova a causa — mas nomeia o suspeito e
   explica por que recarregar a pagina resolve: recarregar e a unica coisa no
   sistema hoje que de fato reinicia o engine.

4. **Duas coisas mudaram juntas na colocacao da arena.** Nesta sessao entraram
   (a) a **medicao de extensao do plano** que reprova superficies pequenas e
   (b) a arena com tamanho fisico fixo, sem slider. O sintoma "so coloca depois
   de muitos toques" e compativel com (a) reprovando a maioria dos toques — mas
   **isso nao foi isolado**. Registrado como hipotese, nao como causa, para nao
   repetir o erro de `ed93779` (ver `ra-e-paisagem.md`).

5. **O gesto do Beat 5 depende da geometria, nao so da intencao.** A ideia
   ("aproxime e toque na torre") sobreviveu ao teste; a execucao, nao. Precisar
   ir **atras** da torre para o toque pegar aponta para o alvo de picking estar
   obstruido pela frente — e a frente e justamente de onde o jogador olha.

**Nao resolveu:** nada foi tentado e descartado nesta sessao no que diz respeito
a estes achados — eles apareceram no primeiro teste em device, depois da
implementacao, e o conserto ficou para a proxima sessao por decisao do usuario.

### (sem commit) — fantasma da arena e inversao do gate de colocacao (2026-08-14)

**Feito:** a interacao de colocar a arena foi refeita inteira, e duas correcoes
pequenas entraram no fim.

- **`src/ar/ArenaGhost.ts` (novo):** o torus verde (`createHitCursor`) saiu e no
  lugar entrou o contorno real da arena — moldura de barras de 0,53 m x 0,80 m
  com marcadores de canto, deitada na superficie, colorida por estado. As
  dimensoes vem de `ARENA_WIDTH_METERS`/`ARENA_LENGTH_METERS`, nunca proprias.
- **`src/ar/placementGate.ts` (novo):** logica pura com seis estados
  (`waiting-tracking`, `searching`, `out-of-frame`, `too-small`, `ready`,
  `ready-degraded`), histerese na saida de `ready` e `canPlace` como unica
  resposta a "esse toque ancora?".
- **`hitTestSampling.ts`:** `buildFootprintProbes` (4 cantos + 4 meios de borda)
  e `measureFootprintCoverage`, que substituem o anel circular de ~31 amostras
  de `measurePlaneCoverage` por 8 sondas no contorno real da arena.
- **`EighthWallARManager.ts`:** loop de preview com **dois ritmos** — pose do
  fantasma por frame (1 hitTest central), veredito a cada 200 ms (fit + 8
  sondas). O toque deixou de medir: ele CONFIRMA o que o contorno mostra,
  ancorando no `previewFit` da ultima avaliacao aprovada.
- **Telemetria:** evento `placement_rejected` com `reason`, `inFrame`,
  `onPlane`, `offPlane` e `total`.
- **Mira:** o ponto mirado passou a ancorar o **centro** da arena. Antes ancorava
  as costas da torre azul, deslocando o contorno ~40 cm a frente do ponto
  apontado; `getPlacementAnchorLocal` foi removido.
- **`CardDeckHud.ts:83`:** `height = "auto"` trocado por `${CARD_HEIGHT}px`, mais
  o teste-guarda `src/ui/guiUnits.test.ts`, que varre `src/ui/**` atras de
  unidade invalida em `width`/`height`.
- **`main.ts`:** `stopCameraSampling()` no `match_ended`.

Verificacao automatizada ao fim: `npx tsc --noEmit` limpo, `npm test` com 160
testes passando (13 arquivos), `npm run build` sem erro.

**Resultado em device (tres rodadas, Android/Chrome, 2026-08-13 e 2026-08-14):**

| Rodada | Politica do gate | Recusas | Ancorou? |
|---|---|---|---|
| 1 (2026-08-13, ~09:22) | prova positiva, plano do anel central | 21 (`too-small` 15, `out-of-frame` 6) | **nao** |
| 2 (2026-08-13, ~09:48) | prova positiva + refit + tolerancia 6 cm | 58, **todas** `too-small` | **nao** |
| 3 (2026-08-14, ~00:25) | veto (prova contraria) | **0** | **sim, aos 48,2 s** |

**Provou:**

1. **Um gate que exige prova positiva nao funciona sobre o hitTest do SLAM.** A
   rodada 1 recusou 15 toques por `too-small` com o aparelho apontado para o
   **chao de uma cozinha** — uma superficie onde cabe qualquer coisa. Isso e a
   prova de que o problema era a medicao, e nao a superficie, e derrubou de uma
   vez a leitura de que bastava afrouxar limiar ou encolher a arena.

2. **A causa raiz da medicao errada era extrapolacao de plano.** O fit vinha de
   um anel de 4 cm de raio no centro da tela e era usado para julgar cantos a
   40 cm de distancia — 10x o raio que o produziu. Um erro de 3 graus na normal
   vira 2 cm na ponta; 5 graus viram 4,4 cm, e a tolerancia era de 4 cm. O
   conserto foi refazer o fit sobre os proprios acertos das sondas.

3. **Silencio de sensor nao e evidencia.** Era essa a falha conceitual embaixo de
   tudo: sonda sem leitura contava igual a sonda reprovada. `FootprintCoverage`
   passou a separar `offPlane` (superficie real fora do plano — a borda da mesa)
   de "nao mediu nada", e o gate so recusa com `offPlane >= 2`. Depois disso a
   arena ancorou no **primeiro toque**.

4. **A hipotese 3 desta lista estava certa.** Feedback continuo antes do toque —
   o contorno do tamanho real, colorido por estado — era mesmo o conserto da
   interacao. Com ele, e sem nenhuma recusa, a colocacao deixou de exigir
   insistencia.

5. **O `NaN` em `CardDeckHud.ts:83` era mesmo a causa das cartas invisiveis.**
   Confirmado em device pelo usuario apos a correcao: "os HUD das cartas vidas e
   cogumelo apareceram". O bloqueador 1 fecha.

6. **Mas renderizar nao e poder jogar.** No mesmo teste: **em RA o toque na carta
   nao registra**; em modo tela as cartas funcionam. E um bug NOVO e diferente
   do `NaN`, e e ele que hoje impede a batalha em RA.

7. **A escala de 80 cm foi elogiada, nao criticada.** Palavras do usuario sobre o
   chao: "isso deixou o tamanho dos bichos muito legal". Isso e um argumento
   **contra** encolher a arena, que estava sendo cogitado.

8. **A primeira partida completa aconteceu.** `arena_placed` aos 48,2 s,
   `enemy_awakened` aos 119,9 s, `match_ended` aos 234,8 s. O intervalo da
   metrica principal foi de **71,6 s** (a spec considera validado acima de 30 s)
   e a camera chegou a **0,51 m** da arena. **Ressalva obrigatoria:** quem testou
   foi o autor do jogo, explorando o proprio sistema — o numero nao vale como
   leitura da metrica, que exige alguem que nao conhece o jogo. Vale so como
   prova de que o funil inteiro roda de ponta a ponta.

9. **A partida terminou 0 x 100 para a IA.** Coerente com o jogador nao ter
   conseguido jogar carta nenhuma (achado 6).

10. **As mensagens de status sao pequenas demais para serem lidas.** Palavras do
    usuario: "extremamente pequena", "fininha", "nao da para ler". Todo o
    trabalho de tornar as mensagens acionaveis (`placementMessage`) e inutil
    enquanto elas nao forem legiveis.

11. **Circular a arena funciona indo devagar.** Usuario: "se for devagar da para
    dar a volta na arena e ir atras da torre". Observado **no chao**, em uma
    rodada. Nao generaliza para mesa nem dispensa a medicao de deslize do Beat 3.

12. **O Beat 5 continua nao intuitivo** — confirmado pela terceira vez. Explorar,
    por outro lado, o usuario descreveu como intuitivo.

13. **A telemetria continuava amostrando depois do fim da partida:** 45 amostras
    identicas de 58,17 m apos `match_ended`, com a arena ja fora do estado de RA,
    onde "metros" nao quer dizer nada.

**Nao resolveu:**

- **Remover `FEATURE_POINT` das sondas, sob a politica de prova positiva.**
  Esperava-se reduzir falso positivo; o resultado foi a rodada 2 com 58 recusas
  **todas** `too-small`. A memoria de referencia do projeto ja avisava que
  superficies "costumam demorar/faltar" — tirar o ultimo recurso deixou as sondas
  mudas, e sonda muda reprovava. A exclusao foi **mantida**, mas so porque a
  polaridade mudou: sob veto, um ponto solto no ar seria um veto falso.
- **Afrouxar os numeros** (tolerancia 4 -> 6 cm, `MIN_IN_FRAME_PROBES` 8 -> 6).
  Sozinho nao resolveu — a rodada 2 ja tinha os dois e falhou em 58 toques.
- **Encolher a arena.** Cogitado pelo usuario nas duas primeiras rodadas e **nao
  feito**, porque a evidencia do chao mostrou que o problema era medicao. O
  achado 7 depois confirmou que teria sido o ajuste errado.

**Cuidado ao ler esta etapa:** a rodada 1 -> rodada 2 mudou **cinco** coisas de
uma vez (refit do plano, rotacao alinhada ao piso, remocao de `FEATURE_POINT`,
tolerancia, limiar de quadro) e o resultado piorou de forma nao isolavel. E o
mesmo padrao do `ed93779` registrado em `ra-e-paisagem.md`, cometido de novo e
de forma consciente — a justificativa dada na hora foi que as cinco produziam o
mesmo sintoma e nenhuma seria observavel isolada. A rodada 2 -> rodada 3, essa
sim, mudou **so** a polaridade do gate, e e dela que sai a atribuicao do achado 1.

## Estado atual (2026-08-14)

| | Situacao |
|---|---|
| Explorar a arena (RA e tela) | Funciona — confirmado em device |
| Estetica das criaturas | Aprovada pelo usuario |
| Fim de partida + dissolucao da arena (Beat 7) | **Funciona** — confirmado em device e elogiado |
| IA por script e vitoria por torre destruida | **Funciona** — confirmado em device (foi a IA que encerrou a partida) |
| Cartas renderizando no HUD | **Funciona** — confirmado em device (2026-08-14) apos a correcao do `NaN` |
| **Tocar a carta em RA** | **Quebra** — o toque nao registra; em modo tela funciona |
| Colocar a arena em RA (chao) | **Funciona** — confirmado em device (2026-08-14): 0 recusas, ancorou aos 48,2 s |
| Colocar a arena em RA (mesa/bancada) | **Nao confirmado** — o usuario nao conseguiu antes da inversao do gate, e nao retestou depois |
| Legibilidade das mensagens de status | **Quebra** — "extremamente pequena, nao da para ler" |
| Segunda sessao de RA sem recarregar | **Quebra** — bug antigo; camera liga e mais nada. Nao tocado nesta sessao |
| Beat 5 (tocar a torre inimiga) | **Ruim** — confirmado de novo; nao intuitivo |
| Explorar a arena | **Funciona** e o usuario descreveu como intuitivo |
| Andar em volta da arena | Parcial — **funciona indo devagar** no chao (2026-08-14); deslize nao medido |
| Nascimento da arena | Funciona, mas "seco" — sem impacto |
| Escala de 80 cm | **Aprovada no chao** — "deixou o tamanho dos bichos muito legal" |
| Comportamento ocioso das criaturas | Compila, logica testada (unit); **nao avaliado em device** |
| Invocacao em dois toques | **Nao exercitada em RA** — bloqueada pelo toque na carta |
| Timer de 3 min e cogumelo dobrado | Compila; **nao observados** |
| Partida completa de ponta a ponta | **Roda** — confirmado em device (2026-08-14), mas o jogador perdeu 0 x 100 sem jogar carta |
| Metrica principal (`arena_placed` -> `enemy_awakened`) | **Ainda nao medida com validade** — 71,6 s registrados, mas com o autor testando o proprio jogo |

## Hipoteses vivas

Em ordem de suspeita, com o teste que decide cada uma:

1. **A segunda sessao de RA falha porque o engine nunca para — modulos e
   behavior sao reinstalados por cima de um pipeline que continua rodando.**
   O `exitAR` remove o modulo de status pelo nome, solta o coaching overlay e
   descarta a `FreeCamera`, mas **nao para o engine**. No `enterAR` seguinte,
   `addCameraPipelineModule` e um `xrCameraBehavior` novo entram num engine que
   ja esta no ar — e modulos adicionados depois do `run()` podem nao receber o
   ciclo de vida completo (`onAttach`/`onStart`), o que deixaria
   `latestTrackingStatus` eternamente `null`. E exatamente isso que produz o
   sintoma: `isTrackingReady()` nunca vira true, a ancoragem nunca libera, e o
   loader de setup fica para sempre com a camera ligada atras.
   **Teste:** abrir com `?debug=1`, entrar na RA, sair, entrar de novo e olhar
   o `trackingStatus` no overlay. Se na primeira sessao ele progride e na
   segunda fica vazio/`null`, a hipotese esta confirmada.
   **Conserto na direcao certa:** parar o engine de verdade no `exitAR`
   (`XR8.stop()`, ou `pause()`/`resume()` se a intencao for preservar o mapa do
   SLAM entre partidas) e garantir que os modulos sejam registrados antes de o
   engine subir. Atencao: hoje **nenhum dos dois metodos esta declarado** em
   `src/types/xr8.d.ts` — a tipagem precisa acompanhar.

2. **RESOLVIDA (2026-08-14) — a medicao de extensao do plano era severa demais.**
   Era, mas por um motivo mais fundo do que o limiar: o plano vinha extrapolado
   de um anel de 4 cm, e o gate exigia prova positiva de um sensor que fica mudo.
   Ver a entrada de 2026-08-14. O texto original fica registrado acima na
   entrada de 2026-08-12.

3. **RESOLVIDA (2026-08-14) — o aviso binario e tardio nao era acionavel.** O
   teste proposto era exatamente o contorno do tamanho real colorido por estado,
   e ele foi implementado (`ArenaGhost`): a colocacao passou a acontecer no
   primeiro toque, com zero recusas na rodada 3. **Ressalva:** confirmado so no
   chao.

4. **O picking da torre inimiga esta obstruido pela frente.** Candidatos
   concretos: a `DeploymentZone` (filha do `arenaRoot`, com offset Y de 0.22
   unidades autorais) ou a barra de vida da torre, ambas entre a camera e a
   torre quando se olha do lado do jogador. **Teste:** logar
   `pickInfo.pickedMesh.name` em cada toque durante `world-alive` e ver o que
   esta sendo acertado quando o toque "nao pega". Se vier o nome de outra mesh,
   a hipotese esta confirmada e o conserto e `isPickable = false` nela.

5. **PARCIALMENTE RESOLVIDA (2026-08-14) — o bug das cartas nao era o unico do
   HUD novo.** A altura `NaN` foi corrigida e as cartas aparecem, mas a
   percorrida em device achou mais dois defeitos: o toque na carta nao funciona
   em RA (hipotese 6) e as mensagens de status sao ilegiveis (hipotese 7).

6. **O toque na carta nao chega ao HUD em RA porque o `AdvancedDynamicTexture` de
   tela cheia continua apontando para a camera anterior.** O `enterAR` troca
   `scene.activeCamera` por uma `FreeCamera` nova e descarta a antiga no
   `exitAR`; o Babylon resolve o ponteiro do GUI de tela cheia por
   `scene.cameraToUseForPointers` (com fallback na `activeCamera`), e nada no
   projeto atualiza isso na troca. Em modo tela a camera nunca troca — que e
   exatamente o modo onde as cartas funcionam. **Suspeita alta, mas e hipotese:
   nao foi verificada no codigo do Babylon nem em device.** **Teste:** logar
   `scene.cameraToUseForPointers?.name` e o resultado de
   `advancedTexture.pick`/`_pointerObserver` no toque durante `playing` em RA;
   se apontar para a camera velha (ou nula), a hipotese esta confirmada.
   Candidata alternativa: o `WorldTapRouter`, dono unico de
   `scene.onPointerObservable`, consumindo o POINTERDOWN antes do GUI.

7. **As mensagens de status estao pequenas porque `arStatusText` nao acompanha o
   espaco ideal do HUD em retrato.** O `HudLayer` usa `useSmallestIdeal` com
   `idealWidth = 720` em retrato, e ha memoria do projeto registrando que 1 px
   do espaco ideal vale ~0,54 px CSS no celular — o mesmo fator que ja obrigou os
   botoes do painel de setup a irem para 84 px. O `arStatusText` tem
   `height = "56px"` e nenhum `fontSize` explicito. **Teste:** medir o tamanho
   renderizado em device e comparar com os ~44 px CSS recomendados; corrigir por
   `fontSize` em px do espaco ideal.

8. **Colocar a arena numa mesa/bancada continua sem veredito.** O usuario nao
   conseguiu nas rodadas 1 e 2 e **nao retestou** depois da inversao do gate. A
   explicacao dele foi de distancia: "o tamanho da arena exige uma distancia e
   isso dificultou colocar ela na mesa/bancada" — no chao, com 1,70 m de altura,
   ele conseguiu. **Teste:** repetir a rodada 3 numa mesa e ler `offPlane` no
   JSON. Se vier `offPlane >= 2`, a mesa realmente nao comporta os 80 cm e a
   decisao passa a ser de geometria; se vier tudo zerado e mesmo assim recusar,
   o problema e outro.

## Proximos passos (atualizados em 2026-08-14)

Colocar a arena saiu do caminho critico. O que impede a demo agora e **jogar**.

**1. Fazer o toque na carta funcionar em RA** (hipotese 6). Hoje a batalha em RA
nao existe: as cartas aparecem e nao respondem. E o sucessor direto do bug do
`NaN` — mesmo sintoma para o jogador ("nao da para jogar"), causa diferente.
Comecar pelo diagnostico, nao pelo conserto: as duas causas candidatas
(`cameraToUseForPointers` e o `WorldTapRouter`) pedem consertos opostos.

**2. Tornar as mensagens de status legiveis** (hipotese 7). Barato e desbloqueia
todo o resto do feedback: enquanto nao der para ler, nenhuma mensagem acionavel
que se escreva chega ao jogador.

**3. Retestar a colocacao numa mesa** (hipotese 8). E o unico dado que falta para
decidir se a arena de 80 cm fica ou encolhe — e o achado 7 da entrada de
2026-08-14 (o elogio ao tamanho das criaturas no chao) e um argumento forte para
ela ficar.

**4. Encerrar a sessao de RA de verdade** (hipotese 1). Continua sem conserto e
continua sendo o que impede testar com varias pessoas seguidas sem recarregar o
app. Nao foi tocado nesta sessao.

**5. Consertar o alvo do Beat 5** (hipotese 4). Terceira confirmacao em device de
que o gesto e bom e o alvo nao pega de onde o jogador olha.

**6. Dar um nascimento a arena.** O `playSpawnScaleIn` atual nao entrega o
momento. Este e o primeiro instante em que o mundo aparece — e a demo inteira
existe para medir a reacao a esse instante.

**7. So entao medir a metrica principal.** Rodar uma sessao completa com alguem
que **nao conhece o jogo**, gravando a mao e o corpo da pessoa, nao a tela. Os
71,6 s registrados em 2026-08-14 nao servem: quem testou foi o autor.

**8. Retestar o criterio do Beat 3** (arena nao desliza mais que ~2 cm em 60 s
circulando). O relato de que "indo devagar da para dar a volta" e encorajador,
mas nao e medicao.

**9. Verificar que o teste-guarda de unidades do GUI nao passa vazio.**
`src/ui/guiUnits.test.ts` varre `src/ui/**` atras de unidade invalida em
`width`/`height`. O teste passa, e ele prova que o validador rejeita `"auto"` —
mas **nao foi verificado que o scanner encontra alguma atribuicao**, entao ele
pode estar passando por nao achar nada. Confirmar contando as ocorrencias, ou
reintroduzindo `"auto"` temporariamente para ver o teste falhar.
