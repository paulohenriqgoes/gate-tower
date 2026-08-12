# Experimento: a demo do mundo vivo

Diario da demo que existe para responder **uma unica pergunta**, com pessoas
reais testando: *a pessoa acredita que apareceu um mundo vivo na mesa dela?*
Registra o que foi construido para responder isso, o que o primeiro teste em
device mostrou, e o que continua aberto. Ultima atualizacao: **2026-08-12**.

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

## Estado atual (2026-08-12)

| | Situacao |
|---|---|
| Explorar a arena (RA e tela) | Funciona — confirmado em device |
| Estetica das criaturas | Aprovada pelo usuario |
| Fim de partida + dissolucao da arena (Beat 7) | **Funciona** — confirmado em device e elogiado |
| IA por script e vitoria por torre destruida | **Funciona** — confirmado em device (foi a IA que encerrou a partida) |
| Cartas na batalha | **Quebra** — causa-raiz identificada (`CardDeckHud.ts:83`) |
| Segunda sessao de RA sem recarregar | **Quebra** — bug antigo; camera liga e mais nada |
| Colocar a arena em RA | **Ruim** — exige insistencia; aviso nao acionavel |
| Beat 5 (tocar a torre inimiga) | **Ruim** — so funciona por tras da torre |
| Nascimento da arena | Funciona, mas "seco" — sem impacto |
| Andar em volta da arena | Parcial — drift ao passar para tras (ver `ra-e-paisagem.md`) |
| Comportamento ocioso das criaturas | Compila, logica testada (unit); **nao avaliado em device** |
| Invocacao em dois toques | Compila; **nao exercitada** (bloqueada pelo bug das cartas) |
| Timer de 3 min e cogumelo dobrado | Compila; **nao observados** (a partida acabou por torre destruida antes) |
| Metrica principal (`arena_placed` -> `enemy_awakened`) | **Nao medida** — nenhuma sessao completa ainda |

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

2. **A medicao de extensao do plano e severa demais e e o que trava a
   colocacao.** Ela dispara ~31 `hitTest` extras num anel largo (raio 0.42) e
   reprova quando a cobertura medida fica abaixo de `0.9 x 0.80 m` de
   profundidade ou `0.9 x 0.533 m` de largura. A extensao medida e um **limite
   inferior** (so enxerga onde os hitTests bateram), entao mesa boa pode
   reprovar. **Teste:** abrir com `?debug=1` e ler `surfaceDepth`,
   `surfaceWidth` e `surfaceInliers` (ja instrumentados) a cada toque recusado.
   Se os valores ficarem logo abaixo do limiar numa mesa que claramente cabe, a
   hipotese esta confirmada e o conserto e afrouxar o limiar ou trocar o
   criterio.

3. **O aviso "aponte para uma superficie maior" nao e acionavel porque e
   binario e tardio.** Ele so aparece **depois** do toque recusado, e nao diz o
   quanto falta nem para onde ir. **Teste:** substituir por feedback continuo
   antes do toque (um retangulo do tamanho real da arena, projetado no chao,
   verde quando cabe e vermelho quando nao) e ver se a colocacao passa a
   acontecer no primeiro toque.

4. **O picking da torre inimiga esta obstruido pela frente.** Candidatos
   concretos: a `DeploymentZone` (mesh nova nesta sessao, filha do `arenaRoot`,
   com offset Y de 0.22 unidades autorais) ou a barra de vida da torre, ambas
   entre a camera e a torre quando se olha do lado do jogador. **Teste:** logar
   `pickInfo.pickedMesh.name` em cada toque durante `world-alive` e ver o que
   esta sendo acertado quando o toque "nao pega". Se vier o nome de outra mesh,
   a hipotese esta confirmada e o conserto e `isPickable = false` nela.

5. **O bug das cartas pode nao ser o unico do HUD novo.** O HUD foi reescrito
   inteiro (de barra-em-paisagem para zonas de retrato) e nenhum teste o
   instancia. A altura `NaN` foi encontrada; nao ha garantia de que e a unica.
   **Teste:** depois de corrigir a linha 83, percorrer a partida inteira em
   device conferindo cada elemento do HUD minimo (cogumelos, 4 cartas, HP das
   duas torres, timer) e o comportamento no ultimo minuto.

## Proximos passos

Priorizados por desbloqueio: os tres primeiros sao o que separa a demo de poder
ser testada com uma pessoa de verdade.

**1. Corrigir a altura da fileira de cartas** (`src/ui/CardDeckHud.ts:83`).
Trocar `"auto"` por um valor valido em px do espaco ideal, ou usar
`adaptHeightToChildren`. E uma linha, e sem ela nao existe batalha. Depois,
percorrer o HUD inteiro em device (hipotese 5).

**2. Encerrar a sessao de RA de verdade** (hipotese 1). Sem isso **nao da para
testar com mais de uma pessoa seguida** sem recarregar o app entre uma e outra —
o que na pratica inviabiliza a sessao de testes que a demo inteira existe para
produzir. Isso promove um bug antigo e tolerado ao caminho critico: ele deixou
de ser incomodo de desenvolvimento e virou bloqueio de metodologia.

**3. Refazer a interacao de colocar a arena.** Medir primeiro (hipotese 2) para
saber se e o limiar; e independentemente disso, trocar o aviso binario por
feedback continuo antes do toque (hipotese 3). Este e o momento em que a pessoa
decide se o sistema funciona ou nao — e hoje ele parece quebrado.

**4. Consertar o alvo do Beat 5** (hipotese 4). O gesto e bom; o alvo e que nao
esta pegando de onde o jogador olha.

**4. Dar um nascimento a arena.** O `playSpawnScaleIn` atual nao entrega o
momento. Este e o primeiro instante em que o mundo aparece na mesa — e a demo
inteira existe para medir a reacao a esse instante. Vale mais do que parece.

**5. So entao medir a metrica principal.** Rodar uma sessao completa com alguem
que nao conhece o jogo, gravando **a mao e o corpo da pessoa, nao a tela**, e ler
o intervalo `arena_placed` -> `enemy_awakened` no JSON exportado.

**6. Retestar o critério do Beat 3** (arena nao desliza mais que ~2 cm em 60 s
circulando a mesa). Nao foi medido nesta sessao.
