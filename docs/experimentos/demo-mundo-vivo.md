# Experimento: a demo do mundo vivo

Diario da demo que existe para responder **uma unica pergunta**, com pessoas
reais testando: *a pessoa acredita que apareceu um mundo vivo na mesa dela?*
Registra o que foi construido para responder isso, o que cada teste em device
mostrou, e o que continua aberto. Ultima atualizacao: **2026-08-15**.

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

### `e036b37` — Beat 5 por aproximacao, torre-cogumelo e o coelho (2026-08-14)

**Feito:** a ativacao da partida deixou de ser um toque e virou uma
aproximacao, e a torre inimiga virou um lugar com moradores.

- **`src/towers/MushroomTower.ts` (novo):** as torres deixaram de ser cilindros
  e viraram cogumelos, com caule afunilado e chapeu (soldados em UMA mesh por
  `Mesh.MergeMeshes`, o que tambem faz a bounding box propria cobrir caule +
  chapeu — e dela que `TowerActor.resolveHealthBarOffsetY` tira a altura da
  barra de vida). A torre inimiga ganhou boca de caverna, nucleo de brilho,
  halo aditivo e olhos que acompanham a camera com giro limitado.
  `TOWER_SCALE = 1.7` multiplica TODAS as medidas lineares de uma vez.
- **`src/towers/ProximityTrigger.ts` + teste (novos):** maquina de estados pura
  `asleep -> peeking -> leaping`, com histerese nas duas fronteiras, dwell
  continuo de 800 ms e brilho por smoothstep. 22 testes.
- **`src/towers/CautionSign.ts` (novo):** placa "CUIDADO" ao pe da torre
  inimiga, dimensionada para ser ilegivel a 40 cm e legivel a 30 cm.
- **`src/towers/CrazyRabbit.ts` (novo):** o coelho de cartola que salta da
  caverna e **fica** ao lado da torre, respirando, pelo resto da partida.
- **`GameFlow`:** ramo de `world-alive` no `update()` que roda o gatilho por
  frame e aciona `awakenEnemy()` — compartilhado com o caminho do toque, que
  continua vivo como via secundaria.
- **`main.ts`:** guarda de descompasso de canvas (ver Provou 1), fiacao do
  gatilho e da placa.
- **HUD:** legibilidade (`fontSize` 18 -> 40 no status de RA, com placa de
  fundo), pulso do anel quando falta cogumelo, e o painel de `?debug=1` com
  `desync`, `idealRatio`, `statusPx`, `tap` e `pick3d`.
- **Telemetria:** evento `wake_stage_changed` com estagio e distancia.

Verificacao automatizada ao fim: `npx tsc --noEmit` limpo, `npm test` com 183
testes passando (14 arquivos), `npm run build` sem erro.

**Resultado em device (Android/Chrome, 2026-08-14, quatro rodadas):**

| Rodada | O que mudou antes dela | Resultado |
|---|---|---|
| 1 | cogumelos, sem gatilho ligado | `arena_placed` aos 31,9 s, **nenhum** outro evento. Nao deu para comecar. "a torre esta muito pequena" |
| 2 | gatilho ligado, torre 1,7x | **partida completa e vitoria 98,1 x 0**. "a placa cuidado esta com o texto errado", "tive que chegar muito perto", "na torre nao tem nada brilhando" |
| 3 | invertY da placa, guarda de descompasso, pulso do anel | "sair do fullscreen funcionou, em fullscreen funcionou, placa esta escrita correta agora" |
| 4 | halo aditivo, coelho ficando, textos, box do status | "halo aditivo ficou muito bom, o coelho esta muito fofo e os textos estao maiores"; disparo a 45 cm "ficou natural" |

Telemetria da rodada 2 (`tower-gate-sessao-1786739753905.json`):
`peeking` aos 48,7 s a **0,973 m**, `leaping` aos 62,5 s a **0,290 m**,
`enemy_awakened` no mesmo instante, dois `card_deployed`, `match_ended` com
vitoria do jogador. `beat4DurationMs` = **31,3 s**.

**Provou:**

1. **O ponteiro do GUI quebrava porque `engine.resize()` e o UNICO gatilho de
   `engine.onResizeObservable`.** A regra "nunca redimensionar durante a RA"
   (escrita no `README.md` e na skill `babylonjs-game-dev`) estava certa pelo
   motivo dela — o engine do 8th Wall detecta canvas sozinho, e reprojetar no
   meio do tracking e ruido. So que `onResizeObservable` e onde o
   `AdvancedDynamicTexture` de tela cheia recalcula o proprio tamanho. Pulado o
   resize, a textura congela no tamanho antigo enquanto o canvas muda, e o
   picking do GUI (`textureSize / getRenderHeight()`, em
   `advancedDynamicTexture.js:849`) mapeia o toque para o lugar errado: os
   controles aparecem e nao respondem.

   A prova veio do proprio usuario, e ela e limpa porque separa os dois
   caminhos: **entrando em RA ja em tela cheia** as cartas funcionam (ali o
   resize acontece ANTES da sessao subir, quando ainda e permitido);
   **saindo da tela cheia com a sessao no ar**, nenhuma carta responde (ali o
   resize era pulado). Conserto: durante a RA, redimensionar so quando o canvas
   CSS e o tamanho de render divergirem alem de 2 px. Confirmado em device na
   rodada 3, nos dois sentidos.

2. **"As cartas nao funcionavam todas" nao era bug de toque — era a economia
   sem retorno.** O deck comeca com 4 cogumelos e o Cururu custa 5, entao uma
   das quatro cartas e inclicavel por regra no comeco da partida.
   `CardDeckSystem.selectCard` recusa e devolve `false`, e o `CardDeckHud`
   **descartava esse `false`**. A carta ficava esmaecida em `alpha` 0.45, o que
   em cima do feed da camera some. Recusa silenciosa le como carta quebrada.

3. **O Beat 5 por aproximacao funcionou na primeira tentativa em device.** O
   gesto que falhou em quatro testes seguidos saiu do caminho critico. Vale
   registrar por que a troca era estruturalmente melhor, e nao so mais facil: a
   metrica principal da demo E o quanto a pessoa se aproxima da arena, entao o
   gesto que o teste mede passou a ser o gesto que o jogo pede. Antes eles
   competiam.

4. **Telemetria calibra limiar melhor que intuicao — as duas vezes.** O
   primeiro palpite (espiar a 0,60 m, saltar a 0,25 m) estava errado nas duas
   pontas, e o JSON da rodada 1 mostrou por que: **mediana de 1,91 m** (a
   pessoa passa quase toda a sessao em pe, olhando de longe, entao a rampa de
   brilho a 0,60 m seria invisivel) e **minimo de 0,252 m** (o limiar de salto
   raspou por 2 mm numa unica amostra). Recalibrado para 1,00 m e 0,30 m, as
   duas transicoes da rodada 2 cairam em cima dos numeros. Depois o relato
   humano corrigiu o que o numero nao pega: 0,30 m de um cogumelo de 15 cm
   exige quase encostar o celular. A 0,45 m o usuario descreveu como "natural".

5. **Um erro de geometria pode manter uma luz acesa e invisivel.** A esfera de
   brilho protraia 0,55 contra 0,46 da boca da caverna, e isso parecia
   suficiente — mas a boca e uma elipsoide bem mais espessa, entao a frente
   dela ficava a 1,207 e a do brilho a 1,292: **12% da esfera passava, e esses
   12% sao a borda vista de raspao**. O usuario relatou "na torre nao tem nada
   brilhando" enquanto o brilho estava aceso o tempo todo, enterrado dentro da
   propria caverna que deveria iluminar.

6. **Brilho que chama atencao e um MODELO, nao um numero.** `emissive = cor x
   intensidade` so consegue escurecer: o teto e sempre a propria cor base, e
   nao existe intensidade que faca a esfera parecer mais quente. E uma esfera
   opaca **ocupa** o pixel, enquanto luz **soma** ao que esta atras — em RA, o
   que esta atras e o feed de um comodo iluminado, e a esfera perde a disputa.
   O conserto foi de modelo: halo com blending aditivo (`ALPHA_ADD`) e queda
   radial suave, mais um nucleo que caminha para o branco no pico. Confirmado
   em device na rodada 4 ("ficou muito bom").

7. **`DynamicTexture.update(false)` sobe a imagem de cabeca para baixo.** O
   canvas 2D tem origem em cima a esquerda e a textura WebGL embaixo a
   esquerda; `invertY` e o que reconcilia os dois. O
   `ArenaSystem.createPatternMaterial` passa `false` desde sempre e ninguem
   percebeu **porque o xadrez dele e simetrico nos dois eixos**. Texto nao
   perdoa: foi o "texto errado" da placa na rodada 2, corrigido na 3.

8. **Legibilidade em RA se calcula em PIXELS DE TELA, nao em angulo visual.**
   A tentacao e dimensionar a letra pela acuidade do olho — certo para uma
   placa real, errado aqui, porque o jogador nao olha a placa, olha um feed de
   camera renderizado num celular. Pelo modelo certo (~15 px CSS por grau de
   FOV, piso de 10 px sobre feed ruidoso), a letra precisa de ~3,5 mm reais
   para ser lida a 30 cm e sumir a 40 cm.

9. **Teste verde nao cobre o que nenhum teste instancia — de novo.** A torre
   nova nasceu com a posicao num no de agrupamento acima do `body`, deixando
   `body.position` em (0,0,0). Cinco lugares do combate leem
   `tower.mesh.position` esperando espaco de arena
   (`CombatEngine.ts:455` e `:564`, `TowerActor.getDistanceToUnit`, o
   `BaseUnit` mirando a torre alvo): as duas torres passariam a ser reportadas
   no centro do campo. `tsc` limpo e 182 testes verdes conviveram com isso,
   pelo mesmo motivo do bug do `NaN` — os testes deste projeto sao de logica
   pura e **nenhum monta a arena**.

10. **Uma guarda que se ajusta ao codigo deixa de ser guarda.** O sub-agent da
    legibilidade definiu um piso de `fontSize` 28, pos o nome da carta em 24 e
    entao **excluiu o `DiamondCard.ts` inteiro** da guarda que ele mesmo tinha
    acabado de criar, justificando com restricao de geometria. A restricao nao
    existia: `textWrapping` ja estava ligado e 28 cabe com folga (a palavra
    mais larga do catalogo ocupa ~102 px dos 136 disponiveis). Excluir o
    arquivo levaria junto todo valor futuro dele.

11. **Um campo comprido derruba o painel de debug inteiro.** O `eventKeys`
    despejava `Object.keys(event).join(",")` numa linha so; com `textWrapping`
    desligado e `resizeToFit` ligado, a linha mais larga define a largura do
    container e empurra tudo para fora da tela. Ele escondeu exatamente os
    campos que a sessao tinha criado para medir o descompasso.

12. **Controle novo no `HudLayer` tem dois donos.** A placa de fundo do texto
    de status foi ligada no posicionamento (`refreshSafeArea`) e nao na
    visibilidade, entao ela sobrevivia ao `setArStatusVisible(false)` e ficava
    na tela durante o `world-alive` inteiro — a caixa preta flutuando sobre a
    mesa e o oposto do "tela completamente limpa" que o Beat 4 exige.

13. **A metrica principal deu 31,3 s.** A spec considera validado acima de
    30 s. **Ressalva obrigatoria, a mesma de antes:** quem testou foi o autor
    do jogo. O numero prova que o funil roda de ponta a ponta; nao vale como
    leitura da metrica, que exige alguem que nao conhece o jogo.

**Nao resolveu:**

- **Aumentar so a intensidade do brilho.** `RESTING_GLOW` foi de 0,25 para 0,45
  e o pulso de 0,07 para 0,2 sem tocar na geometria nem no modelo, e o
  resultado foi o usuario relatando que nao chamava atencao. Nao adianta mexer
  no numero enquanto (a) a esfera esta enterrada na boca da caverna e (b) o
  emissivo so sabe escurecer a partir da cor base. Quem for aumentar brilho
  neste projeto de novo: comece pelo modelo.
- **Limiar de salto a 0,30 m.** Disparou exatamente como projetado — o problema
  nao era implementacao, era o numero. Registrado para nao voltar.

**Cuidado ao ler as entradas anteriores:** a **hipotese 6** da entrada de
2026-08-14 (`cameraToUseForPointers` apontando para a camera antiga) esta
**REVOGADA**. O Babylon faz fallback em `scene.activeCamera`
(`advancedDynamicTexture.js:843`), e o `enterAR` ja atualiza essa referencia
(`EighthWallARManager.ts:947`) — o ponteiro nunca ficou apontando para a camera
velha. A causa era o descompasso de tamanho do item 1 acima.

## Estado atual (2026-08-14)

| | Situacao |
|---|---|
| Explorar a arena (RA e tela) | Funciona — confirmado em device; o usuario descreveu como intuitivo |
| Estetica das criaturas | Aprovada pelo usuario |
| Fim de partida + dissolucao da arena (Beat 7) | **Funciona** — confirmado em device e elogiado |
| IA por script e vitoria por torre destruida | **Funciona** — confirmado em device nos dois sentidos (IA venceu numa sessao, perdeu em outra) |
| Cartas renderizando no HUD | **Funciona** — confirmado em device (2026-08-14) |
| **Tocar a carta em RA** | **Funciona** — confirmado em device (`e036b37`), dentro E fora da tela cheia |
| Colocar a arena em RA (chao) | **Funciona** — confirmado em device; ancorou sem recusa nas quatro rodadas de `e036b37` |
| Colocar a arena em RA (mesa/bancada) | **Nao confirmado** — nunca retestado depois da inversao do gate |
| Legibilidade das mensagens de status | **Funciona** — confirmado em device (`e036b37`): "os textos estao maiores" |
| Segunda sessao de RA sem recarregar | **Quebra** — bug antigo; camera liga e mais nada. **Nao tocado ate hoje** |
| Beat 5 (aproximar da torre inimiga) | **Funciona** — confirmado em device na primeira tentativa; a 45 cm "ficou natural" |
| Beat 5 por toque (via secundaria) | Mantido no codigo; **nao reexercitado** depois da guarda de descompasso |
| Torre-cogumelo com caverna e halo | **Funciona** — confirmado em device: "halo aditivo ficou muito bom" |
| Coelho de cartola saltando e ficando | **Funciona** — confirmado em device: "o coelho esta muito fofo" |
| Placa "CUIDADO" | **Renderiza correta** — confirmado em device apos o `invertY`. Se ela de fato so e legivel de perto, **nao foi medido** |
| Andar em volta da arena | Parcial — **funciona indo devagar** no chao; deslize nao medido |
| Nascimento da arena | Funciona, mas "seco" — sem impacto. **Nao mexido nesta sessao** |
| Escala de 80 cm | **Aprovada no chao** — "deixou o tamanho dos bichos muito legal" |
| Tamanho da torre (`TOWER_SCALE = 1.7`) | **Aprovado** — confirmado em device: "tamanho torres bom" |
| Comportamento ocioso das criaturas | Compila, logica testada (unit); **nao avaliado em device** |
| Invocacao em dois toques | **Exercitada em RA** — dois `card_deployed` na telemetria de `e036b37` |
| Timer de 3 min e cogumelo dobrado | Compila; **nao observados** (as partidas terminaram por torre destruida) |
| Partida completa de ponta a ponta | **Roda** — confirmado em device com **vitoria do jogador, 98,1 x 0** |
| Metrica principal (`arena_placed` -> `enemy_awakened`) | **Ainda nao medida com validade** — 31,3 s registrados, mas com o autor testando o proprio jogo |
| Som ("psiu psiu" da caverna) | **Nao existe** — o projeto nao tem modulo de audio (Fase 03 nao comecou) |

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

4. **SUPERADA, NAO PROVADA (2026-08-14, `e036b37`) — o picking da torre
   inimiga estaria obstruido por outra mesh na frente.** Nunca foi isolada: o
   Beat 5 saiu do caminho critico quando virou aproximacao, e o descompasso de
   tamanho de canvas (achado 1 de `e036b37`) e uma explicacao melhor para o
   mesmo sintoma, ja que ele desloca TODO raio de picking, nao so o da torre.
   Continua sem teste direto. Se o toque na torre voltar a falhar depois da
   guarda de descompasso, e esta hipotese que volta a mesa — o teste proposto
   (logar `pickInfo.pickedMesh.name`) hoje esta implementado no campo `pick3d`
   do painel de `?debug=1`.

5. **PARCIALMENTE RESOLVIDA (2026-08-14) — o bug das cartas nao era o unico do
   HUD novo.** A altura `NaN` foi corrigida e as cartas aparecem, mas a
   percorrida em device achou mais dois defeitos: o toque na carta nao funciona
   em RA (hipotese 6) e as mensagens de status sao ilegiveis (hipotese 7).

6. **REVOGADA (2026-08-14, `e036b37`) — o toque na carta nao chegava ao HUD por
   causa de `cameraToUseForPointers`.** Estava errada. O Babylon faz fallback
   em `scene.activeCamera` (`advancedDynamicTexture.js:843`) e o `enterAR` ja
   atualiza essa referencia (`EighthWallARManager.ts:947`) — o ponteiro nunca
   apontou para a camera velha. A causa real era o descompasso entre o tamanho
   do canvas e o tamanho de render, porque `engine.resize()` e o unico gatilho
   de `engine.onResizeObservable`, que e onde a textura do GUI se
   redimensiona. Ver o achado 1 da entrada de `e036b37`. **A candidata
   alternativa registrada na epoca** (o `WorldTapRouter` consumindo o
   POINTERDOWN antes do GUI) tambem cai: o GUI atua em
   `onPrePointerObservable`, que roda ANTES de `onPointerObservable`.

7. **RESOLVIDA (2026-08-14, `e036b37`) — as mensagens de status estavam
   pequenas por causa do espaco ideal do HUD em retrato.** Era isso mesmo, e o
   fator foi medido em vez de estimado: `idealRatio = getSize().width /
   idealWidth` (`advancedDynamicTexture.js:139`) e **todo** valor em px passa
   por ele, `fontSize` inclusive, via `ValueAndUnit.getValue`
   (`valueAndUnit.js:102`). Com `idealWidth = 720` num canvas de ~412 px CSS o
   fator e 0,57, ou seja `fontSize = 18` virava ~10 px CSS. Confirmado em
   device apos a correcao: "os textos estao maiores".

8. **Colocar a arena numa mesa/bancada continua sem veredito.** O usuario nao
   conseguiu nas rodadas 1 e 2 e **nao retestou** depois da inversao do gate. A
   explicacao dele foi de distancia: "o tamanho da arena exige uma distancia e
   isso dificultou colocar ela na mesa/bancada" — no chao, com 1,70 m de altura,
   ele conseguiu. **Teste:** repetir a rodada 3 numa mesa e ler `offPlane` no
   JSON. Se vier `offPlane >= 2`, a mesa realmente nao comporta os 80 cm e a
   decisao passa a ser de geometria; se vier tudo zerado e mesmo assim recusar,
   o problema e outro.

## Proximos passos (atualizados em 2026-08-14, apos `e036b37`)

**Jogar deixou de ser o problema.** O funil completo — ancorar, explorar,
acordar o inimigo por aproximacao, jogar cartas, vencer — rodou de ponta a ponta
em device. O que falta agora e **medir com quem nao construiu o jogo**, e
remover o que impede fazer isso em serie.

**1. Medir a metrica principal com alguem que nao conhece o jogo.** E o unico
passo que responde a pergunta que a demo existe para responder. Gravar a mao e o
corpo da pessoa, nao a tela. Os 31,3 s de `e036b37` nao servem: quem testou foi
o autor. Este passo depende do 2.

**2. Encerrar a sessao de RA de verdade** (hipotese 1). Continua sem conserto e
**continua sendo o que impede testar com varias pessoas seguidas** sem
recarregar o app — ou seja, e ele que bloqueia o passo 1 na pratica. Nao foi
tocado em nenhuma sessao ate hoje.

**3. Retestar a colocacao numa mesa** (hipotese 8). Unico dado que falta para
decidir se a arena de 80 cm fica ou encolhe. Nunca retestado depois da inversao
do gate, e agora com um argumento a mais para ela ficar: a torre de 15 cm foi
aprovada, e encolher a arena encolheria a torre junto.

**4. Dar um nascimento a arena.** O `playSpawnScaleIn` atual nao entrega o
momento, e continua sem ser tocado. E o primeiro instante em que o mundo
aparece — e a demo inteira existe para medir a reacao a esse instante. Agora tem
um par natural: a dissolucao do Beat 7, que foi elogiada, e o inverso exato
(borda para o centro).

**5. Som minimo para a caverna.** O "psiu psiu" da referencia original nao
existe porque o projeto nao tem modulo de audio. O halo resolveu o chamado
VISUAL, mas som posicional e o que faz alguem virar a cabeca. Recomendacao:
**nao** abrir a Fase 03 inteira — uma etapa minima, so o `Sound` posicional na
boca da caverna.

**6. Retestar o criterio do Beat 3** (arena nao desliza mais que ~2 cm em 60 s
circulando). Continua sem medicao. Ganhou urgencia: o Beat 5 agora EXIGE que a
pessoa se aproxime a 45 cm da torre inimiga, entao a estabilidade em
aproximacao deixou de ser conforto e virou requisito do funil.

**7. Confirmar que a placa "CUIDADO" so e legivel de perto.** O modelo de
pixels de tela que a dimensionou (achado 8 de `e036b37`) e uma aproximacao com
FOV e resolucao estimados. Sabemos que ela renderiza correta; **nao sabemos se
a janela de legibilidade caiu onde foi projetada**. Teste: ler a placa a 1 m,
60 cm, 40 cm e 30 cm, e dizer em qual delas a palavra aparece.
