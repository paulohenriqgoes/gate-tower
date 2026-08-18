# Experimento: arena de 180 graus e atencao como recurso

Diario da v3 do Tower Gate — a reformulacao que existe para responder **uma
pergunta que a demo anterior nao podia responder**: *a RA da para ser mecanica, e
nao cenografia?* Registra o que foi decidido, o que foi construido, o que cada
teste em device mostrou e o que continua aberto. Ultima atualizacao:
**2026-08-17**.

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

## Estado atual (2026-08-17)

| | Situacao |
|---|---|
| Spec v3 e storyboard | **Escritos**, no repo, sem commit |
| Plano de execucao em 11 etapas | **Escrito** (`docs/guias/tower_gate_v3_plano_etapas.md`); nenhuma etapa iniciada |
| Tese central (atencao como recurso) | **Sem nenhuma evidencia** — nao existe prototipo que a exercite |
| Arena polar de 180 graus | **Nao iniciada** (Etapa 1) |
| Escala de sala (torre 1,20 m) | **Nao iniciada** (Etapa 2) — a escala atual em device foi aprovada, mas era a de mesa |
| Ancoragem egocentrica | **Nao iniciada** (Etapa 3) |
| Ondas convergindo ao jogador | **Nao iniciada** (Etapa 4) |
| Alertas de flanco e audio espacial | **Nao iniciados** (Etapa 5); o projeto continua **sem modulo de audio** |
| Colocacao direta com anel | **Nao iniciada** (Etapa 6) |
| Cartas presas ao jogador | **Nao iniciada** (Etapa 7) |
| Caldeirao, economia, intro, album | **Nao iniciados** (Etapas 8-11) |
| Fundacao de RA herdada (calibracao, coaching, fit de plano, gate) | **Funciona** — confirmado em device em 2026-08-14, ver o diario encerrado |
| Segunda sessao de RA sem recarregar | **Quebra** — herdado, nunca tocado; agora bloqueia o Ato 4 |
| Deslize girando no lugar | **Nao medido** — criterio novo, ver achado 4 acima |

## Hipoteses vivas

Em ordem de suspeita, com o teste que decide cada uma.

1. **A tese central pode simplesmente nao ser divertida.** Girar para cobrir tres
   flancos com um par de olhos pode ler como trabalho, nao como jogo — e nada no
   plano prova o contrario antes da Onda 6.
   **Teste:** as Etapas 1-7 jogaveis em device, com alguem que nao conhece o
   jogo, medindo se a pessoa gira por curiosidade ou so quando a seta manda. A
   propria spec §12 nomeia esse corte: "passos 1-4 provam a tese; se a mecanica
   de atencao nao for divertida ali, o resto nao salva".

2. **A ancoragem egocentrica pode driftar mais que a atual, nao menos.** O
   argumento da spec §1 e que ficar parado perto da origem da ancora deixa o VIO
   mais estavel. Plausivel, mas nao testado: girar 180 graus troca o conjunto de
   features enquadrado, que e exatamente o que a spec diz que causa drift.
   **Teste:** fechar a arena, girar o tronco de flanco a flanco por 60 s sem
   caminhar, e medir o deslocamento aparente da base da torre. Criterio proposto:
   ~2 cm. Se falhar, D7 vira a valvula — cair para 120 graus.

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

Seguem as ondas do plano
([`tower_gate_v3_plano_etapas.md`](../guias/tower_gate_v3_plano_etapas.md) §4).
Duas serializacoes sao obrigatorias e nao devem ser negociadas por pressa:

**1. Onda 1 — `ArenaArc` (Etapa 1) e escala metrica (Etapa 2), em paralelo.**
Sao os dois alicerces e nao tem dependencia. `ArenaArc` e logica pura, testavel
sem Babylon; a escala metrica mata `AR_ARENA_SCALE`.

**2. Onda 2 — ancoragem egocentrica (Etapa 3) e diretor de ondas (Etapa 4).**

**3. Onda 3 — validacao em device da ancoragem.** Serial e obrigatoria: responde
a hipotese 2. Se a arena nao ficar parada com o jogador girando, o resto do plano
esta construido sobre nada.

**4. Onda 4 — alertas de flanco (Etapa 5) e colocacao com anel (Etapa 6).**

**5. Onda 5 — cartas presas ao jogador (Etapa 7).** Serial por conflito de
escrita em `HudLayer.ts`, nao por dependencia.

**6. Onda 6 — validacao da tese, com alguem que nao conhece o jogo.** Serial e
obrigatoria: responde a hipotese 1. **Nenhuma das Etapas 8-11 comeca antes deste
veredito.** O README ja registra o erro de medir com o autor testando o proprio
jogo; nao repetir.

**7. Ondas 7-9 — caldeirao e economia (8, 9), intro (10), fim de partida e album
(11).** A Etapa 11 e onde o bloqueador da segunda sessao de RA e pago; se surgir
necessidade de testar com varias pessoas seguidas antes disso, ela sobe de
posicao.
