# Decisoes fechadas da v3

As doze decisoes que o projeto ja tomou sobre a arena de 180 graus, num lugar so,
para pararem de ser re-litigadas a cada sessao. Cada uma carrega o **motivo** —
uma decisao sem motivo registrado nao sobrevive ao primeiro desconforto.

**Todas sao reversiveis**, salvo onde estiver escrito o contrario. Reverter e
legitimo; reverter sem ler o motivo nao.

**Estado de implementacao nao mora aqui** — mora no [quadro](README.md).

## Por que os prefixos

Havia duas decisoes chamadas `D1` no repositorio, em documentos diferentes e sem
relacao entre si: a da spec 08 dizia "nada induz o jogador a girar para fora do
arco"; a do plano de etapas dizia "escala 1 unidade = 1 metro". Citar "D1" era
ambiguo. Agora: **`DR-*`** para decisoes da fundacao de RA, **`DJ-*`** para
decisoes do jogo. Os numeros originais foram preservados, entao `DR-1` e o antigo
`D1` da spec 08 e `DJ-1` e o antigo `D1` do plano.

## `DR-*` — fundacao de RA

Origem: `docs/specs/08-fundacao-ar.md`, secao "Decisoes tomadas". As tres
primeiras saem da mesma medicao de device de 2026-08-19; a `DR-4` e de
2026-08-20 e e sobre o que **nao** precisa ser medido agora.

| ID | Decisao | Motivo |
| --- | --- | --- |
| DR-1 | **Nada induz o jogador a girar para fora do arco.** O `OffscreenIndicator` satura na borda do arco e nunca aponta para tras; som posicional vem de dentro do arco; nao existe spawn, alerta ou recompensa atras do jogador | Medido com laco fechado: girar dentro dos 180 graus custa **0,075 m de deriva mediana**; atravessar as costas num giro de 360 custa **0,78 m**. Como o arco tem 180 graus, +-90 **e** o envelope do jogo — a deriva so vira problema se o jogo pedir o que o design nao precisa |
| DR-2 | **Reposicionar e um botao, sem medicao de deriva.** Nao existe estimador de deriva no jogo; o jogador decide quando a arena saiu do lugar | Estimar deriva por acumulo de saltos de relocalizacao **falhou em medicao**: media estimada de 0,155 m contra 0,082 m real, com correlacao levemente **negativa**. Nao repita esse ciclo sem sinal novo |
| DR-3 | **O gesto de reposicionar e caro e precisa parecer caro.** Entra como transicao de fase, com o coaching overlay de volta — nunca como correcao instantanea no meio da acao | `recenter()` **descarta o mapa do SLAM**: cai para `LIMITED`, o overlay volta, e leva mais de 30 s para reconvergir. Oferece-lo como botao barato no meio da partida seria mentir sobre o custo |
| DR-4 | **O criterio de cinco entradas seguidas em RA deixa de bloquear qualquer unidade.** Ele sai da Onda C e vira **refino**, a ser rodado depois que o game-flow fechar (JG-10 -> JG-11). Nenhuma unidade fica `EM DEVICE` esperando por ele | Decisao do dono do projeto, 2026-08-20. Duas entradas seguidas ja foram vistas em device e provaram o que a RA-F5 existia para provar: a segunda sessao sobe sem recarregar a pagina. As outras tres nao respondem pergunta nova — so medem repeticao — e cada uma custa uma sessao de device, que e serial por natureza. Alem disso o proprio "jogar de novo" da JG-11 exercita a re-entrada de graca: quando o game-flow estiver fechado, cinco entradas seguidas viram consequencia de jogar, e nao um teste a parte. Fazer agora seria pagar caro por um numero que sera remedido de qualquer jeito |

## `DJ-*` — o jogo

Origem: `docs/guias/tower_gate_v3_plano_etapas.md` §1. Fecham pontas soltas da
spec v3 §13 e do storyboard.

| ID | Decisao | Motivo |
| --- | --- | --- |
| DJ-1 | **Escala 1 unidade Babylon = 1 metro.** `AR_ARENA_SCALE` (~0,0333) deixa de existir | A v3 especifica tudo em metros (torre 1,20 m, tropa 0,35 m, fade entre 1,2 e 0,6 m, raio 2–2,5 m). O motivo original de autorar fora de escala — nao dividir por ~30 toda constante espacial — morreu junto com as constantes, que foram reescritas de qualquer jeito |
| DJ-2 | **Colocacao = pressionar a carta, mirar, soltar.** Um gesto continuo. Toque-duplo fica como fallback quando o `pointerup` chega em menos de 150 ms sem movimento de mira | A spec §4 pede "um gesto so" e escreve literalmente *solta*. Dois toques separados sao duas viagens de enquadramento, e enquadramento e o recurso escasso |
| DJ-3 | **Beber o cha = tocar no caldeirao enquadrado.** Sem timer de bebida | A janela de vulnerabilidade que a spec §5 quer **e o proprio ato de enquadrar** o caldeirao: olhar para baixo ja cega os tres flancos. Um timer por cima disso seria punicao dupla |
| DJ-4 | **Hierarquia de audio:** torradeira > alerta de flanco recem-nascido > impacto na torre > tropa > ambiente. Um canal por prioridade, com ducking do inferior | A torradeira ganha porque e a unica informacao que o jogador **nao tem como obter olhando**. Todo o resto tem redundancia visual |
| DJ-5 | **Derrota = a torre cair.** Estoque zerado nunca encerra a partida | Recomendacao da propria spec §13. O cogumelo roxo existe justamente para o estoque nunca ser condicao terminal |
| DJ-6 | **PROVISORIA — o Coelho e a onda final**, nasce no setor central e troca de setor a cada ~20 s, avancando como qualquer inimigo, mais lento | Evita os dois extremos conhecidos: fixo no central torna os laterais decoracao; circular obriga perseguicao e impede defender. **E a decisao com maior chance de cair no primeiro playtest** — perseguir um alvo que muda de setor pode ler como o pior dos dois mundos. Ver hipotese 3 do diario |
| DJ-7 | **SUPERADA por `DJ-9` (2026-08-21).** ~~`ARENA_ARC_DEG = 180`, parametrizavel.~~ O modelo polar nao assume 180 em lugar nenhum | Testar 120 graus vira troca de uma constante, sem tocar em logica. Barateia a unica pergunta de conforto do arco que so playtest responde |
| DJ-8 | **Cartas fazem fade para 35% enquanto o anel de colocacao esta ativo**, nunca somem, e a carta pressionada nunca faz fade | Fecha a ponta solta "mirar longe vs. ler cartas": some o que atrapalha a leitura do chao, permanece o que confirma qual carta esta na mao |
| DJ-9 | **O recurso escasso deixa de ser VER e passa a ser AGIR.** A arena vira um **retangulo a frente do jogador** que cabe inteiro no FOV (`ARENA_WIDTH_M` x `ARENA_DEPTH_M`, com `ARENA_DEPTH_M` = 1,8 m); os tres flancos continuam sendo divisoes **angulares**, mas nao escondem nada. Colocar carta e mirar a fireball so acontecem dentro de `DEPLOY_CONE_DEG` (20 graus) centrado na mira, e sao precisas tres posicoes de mira para cobrir a arena. Supera `DJ-7` | A tese original funcionava por uma **coincidencia geometrica** — o arco era 3x o FOV, entao o FOV cobria exatamente um flanco de tres. Quando o arco encolheu para 90 (pedido do dono do projeto: girar ate +-90 e desconfortavel, e em ambiente pequeno o drift piora), a coincidencia quebrou: com flancos de 30 e FOV de 60, **em 33% dos angulos possiveis nao existe um unico flanco cego**. A saida foi trocar o recurso em vez de devolver o arco. "Vejo tres incendios e so consigo apagar um por vez" nao depende de o FOV ter a largura exata de um flanco, entao sobrevive a qualquer tamanho de arena. Escrita em `613ae10` (2026-08-21); a fonte e o docblock de `src/arena/ArenaArc.ts` (linhas 1-38). **Consequencia ainda nao resolvida:** ela trocou pressao de *informacao* por pressao de *acao*, que e atendida imediatamente — pode ter reduzido a amplitude dos giros e aumentado a velocidade deles (hipotese 10 do diario) |

## Continuam em aberto — so playtest responde

Nao decida nenhuma destas por argumento. Cada uma tem o teste que a decide.

| Pergunta | Como decidir |
| --- | --- |
| **A tese central e divertida?** Girar para cobrir tres flancos com um par de olhos pode ler como trabalho, nao como jogo | As unidades JG-01 a JG-07 jogaveis em device, com **alguem que nao conhece o jogo**, medindo se a pessoa gira por curiosidade ou so quando a seta manda. E a Onda G do quadro, e a spec v3 §12 a define como corte: *"se a mecanica de atencao nao for divertida ali, o resto nao salva"* |
| **A arena cabe num comodo tipico?** Medido em 2026-08-19: arena autorada de 4,4 x 4,4 m (o diametro do arco de 2,2 m) contra um quarto de **2,60 x 2,90 m**. A partida fechou, mas boa parte da arena atravessou parede, e o jogador descreveu a torre de 1,20 m como "um pouco grande", propondo reduzir 20% ou permitir ajuste por pinca | **Rodar a mesma partida num espaco de 5 x 5 m ou ao ar livre, sem mudar nada de codigo**, e perguntar de novo. Uma sessao num quarto de 2,6 m nao separa "a arena e grande demais" de "este comodo e pequeno demais". **Atencao:** a proposta de ajuste por pinca contradiz uma decisao escrita — a escala em RA e fixa porque cada ator ja nasce com o tamanho fisico da spec, e o comentario de `applyArenaScale` argumenta que um controle de escala "so deixaria o jogador desmentir esse tamanho". Ou a escala fisica e o ponto, ou ela e negociavel; as duas nao valem juntas |
| **A deriva acumula ao longo de uma partida de 3 minutos?** Uma sessao curta deu 0,05 -> 0,08 -> 0,15 m (parece crescer) e outra deu 0,07 -> 0,10 -> 0,04 (nao cresce) | Entrar, marcar, fazer **so varredura de flanco** por 3 minutos, e medir o laco fechado a cada minuto. Duas amostras nao decidem |
| **Tuning do cogumelo verde.** Ou coletar vale sempre a pena e o jogador ignora a defesa, ou nunca vale e vira ruido | Instrumentar a taxa de coleta contra a taxa de dano tomado no mesmo intervalo. Nascer atras dos inimigos ajuda, mas nao garante que exista um valor no meio |
| **Duracao da partida: 3 ou 4 minutos?** Define se o Coelho e climax ou presenca constante | Playtest. O teto e o celular na mao |
| **A torre de 1,20 m e o Coelho de 0,70 m intimidam crianca em festa?** A escala foi escolhida para virar presenca; presenca perto demais e ameaca | O Coelho a 1 m de distancia, com crianca, **antes** de qualquer material de divulgacao |
| ~~**O arco confortavel real e 180 graus?**~~ **RESPONDIDA na pratica (2026-08-21)**: nao. O arco foi a 90 por desconforto e drift, e a `DJ-9` trocou o recurso em vez de devolve-lo | A pergunta que a substitui e outra, e **nao e de playtest**: qual a velocidade angular maxima que o tracking aguenta neste aparelho. Ver hipotese 10 do diario — instrumentacao, nao opiniao |

**Adiado pela propria spec:** o **livro de cartas** (direcao Greed Island), que
substituiria mao e album por um objeto unico no mundo. Nao e ponta solta, e
escopo deliberadamente fora da v3.
