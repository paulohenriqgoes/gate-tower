# Tower Gate — Spec v3: arena 180°, colocação direta, caldeirão fermentador

> Documento de implementação. Substitui o modelo table-scale com caminho único central e HUD 2D.
> Stack: Babylon.js + 8th Wall (XR8), portrait, WebAR.

---

## 0. Por que essa mudança

No protótipo atual a AR é cenografia, não mecânica: travando a câmera e trocando por uma câmera 3D
comum, o jogo não muda. Nada no gameplay depende da pose do dispositivo.

A v3 transforma **enquadramento em recurso escasso**. O jogador tem ~60° de campo de visão para
cobrir um arco de 180°. Dois terços estão sempre cegos. Toda ação consome a mesma coisa: para onde
o celular está apontado.

Consequências: morre o caminho único central, morre o HUD 2D de combate, morre a arena de mesa.

---

## 1. Arena

| Parâmetro | Valor | Nota |
|---|---|---|
| Arco total | 180° | `ARENA_ARC_DEG`, parametrizável |
| Setores (flancos) | 3 × 60° | esquerdo, central, direito |
| Raio | 2,0 – 2,5 m | ajustável pelo espaço detectado |
| FOV útil do device | ~60° horizontais | portrait, varia por aparelho |
| Origem | posição do jogador ao fechar a arena | não um ponto tocado na tela |

O jogador é o vértice do arco. A torre e o caldeirão ficam junto dele. Inimigos convergem **em
direção ao jogador**.

### Deslocamento: nenhum

Depois que a arena fecha, o jogador **não caminha**. Gira o tronco e aponta o celular. Colocar
tropa no flanco esquerdo é apontar para lá, não ir até lá.

Benefícios: o jogador permanece próximo da origem da âncora (VIO muito mais estável), o jogo cabe
em sala pequena, e não há risco de esbarrar em pessoas — relevante para o caso de uso em festas.

### Por que 180° e não 360°

Girar 180° com o corpo tira de cena o conjunto de features visuais usado pelo VIO do 8th Wall,
acumulando drift e fazendo a arena "andar". Em 180° o mesmo conjunto permanece enquadrado. Além
disso 360° exigiria caminhar.

**A validar em protótipo**: se 180° cansar, o arco útil pode cair para 120°.

### Ancoragem

Ancoragem em XR8 é explícita — objetos não permanecem fixos automaticamente após o placement.
Manter o padrão validado: coaching overlay → detecção de plano → conteúdo → anchor.

---

## 2. Escala

O protótipo atual falha por escala: os objetos leem como maquete sobre o piso.

| Elemento | Altura | Motivo |
|---|---|---|
| Torre cogumelo | **1,20 m** | obstrui visão; o Coelho cabe no chapéu |
| Coelho Maluco | 0,70 m | menor que a torre, o dobro da tropa |
| Tropa comum | 0,30 – 0,40 m | personalidade do vinyl toy legível a 2 m |
| Caldeirão | 0,50 m | legível de canto de olho, ao lado do jogador |

70 cm para a torre foi descartado: é altura de móvel, o cérebro lê como objeto. 1,20 m é escala de
criatura.

### Consequências técnicas

1. **Blob shadow obrigatório.** Objeto grande sem sombra de contato parece flutuar. Usar quad/decal
   com textura radial no chão — não shadow map, custo alto em mobile.
2. **A torre vira oclusor.** 1,20 m no centro bloqueia visão de flancos opostos. Reforça a mecânica
   de graça, mas os alertas de borda precisam disparar também para inimigos dentro do FOV porém
   escondidos atrás da torre. Usar raycast de visibilidade, não só ângulo.
3. **Fade por proximidade.** A menos de ~0,8 m o near plane corta o modelo. Aplicar fade de
   opacidade entre 1,2 m e 0,6 m.
4. **Drift amplificado.** 1° de erro angular a 2,5 m desloca visivelmente a base do objeto. Manter
   a base sempre visível ajuda a percepção de ancoragem.

---

## 3. Diegese

### Permanece em 2D (overlay)

- Timer da partida
- Barra de vida da torre
- Setas de alerta de flanco (bordas laterais)

### Existe no mundo 3D

| Antes (HUD 2D) | Depois |
|---|---|
| Barra de elixir | Volume de líquido no caldeirão + cartas apagadas quando não dá para pagar |
| Cartas na barra inferior | Cartas presas ao jogador, na diagonal inferior, acompanhando o giro |
| Botão de invocar | Tap na carta → tap no chão do flanco |

### Cartas: presas ao jogador, não ao mundo

Ancorar as cartas na torre criaria um problema: o jogador joga tropa no flanco esquerdo, de costas
para a torre, e não veria a própria mão. As cartas acompanham o jogador e giram com ele.

Isso é coerente com a ficção — a torre, o caldeirão e a fenda são do mundo; as cartas são **suas**.
E resolve o drift de graça, já que não estão ancoradas no espaço.

Cada tipo de carta tem cor de contorno própria: decisão rápida sob pressão sem leitura de texto.

Materiais das cartas devem ser **unlit** e de alto contraste — texto em quad 3D sob luz de ambiente
real fica ilegível.

---

## 4. Colocação de tropa

Um gesto só, no lugar onde importa.

```
tap na carta        →  carta destacada
aponta para o chão  →  anel de colocação projetado no ponto
solta               →  tropa nasce ali, elixir debitado automaticamente
```

### Regras

- **Sem etapa de pagar.** O elixir é debitado na colocação, igual Clash Royale. Separar "onde
  colocar" de "onde pagar" criaria duas viagens de enquadramento para uma ação só.
- **Anel de colocação**: verde quando há recurso suficiente, apagado quando não há. Feedback
  espacial — o jogador vê o lugar exato antes de soltar.
- **Raio mínimo de colocação.** Sem isso o jogador ótimo empilha tudo na base e o jogo vira um tower
  defense de caminho zero. Definir `MIN_PLACE_RADIUS` a partir da torre.
- **A tropa nasce onde foi colocada** — não caminha do centro.

### Onde foi parar o custo de distância

Colocar longe exige apontar longe, e apontar longe significa mais tempo com os outros dois flancos
fora de vista. O custo continua existindo, agora em atenção em vez de tempo de caminhada.

---

## 5. Caldeirão: fermentador de chá

O caldeirão **não** é ponto de invocação. Ele é onde o poder se regenera.

### Regras

- **Um único caldeirão**, ao lado do jogador.
- Cogumelos verdes coletados no chão voam sozinhos até ele e **aceleram a fermentação**.
- Quando o chá fica pronto: **som de torradeira**. O jogador não precisa olhar para saber.
- **Beber restaura o poder instantaneamente.** Sem duração, sem buff temporário — um valor
  monitorado a mais seria mais um lugar para onde olhar, e não há atenção sobrando.
- Beber exige olhar para baixo: **cega os três flancos ao mesmo tempo**. É a única janela de
  vulnerabilidade real do jogo, e o jogador escolhe quando pagá-la.
- O poder também regenera sozinho, bem devagar. O chá é o atalho — assim o jogador nunca trava, mas
  quem gerencia o caldeirão joga melhor.

Estruturalmente é o "recarregar arma" de um shooter: o custo não é o botão, é a janela de exposição.

### Leitura de recurso sem barra

Cartas apagadas = sem poder para pagar. O jogador lê o recurso olhando para as cartas, que já está
olhando. O caldeirão dá a leitura de quanto falta para o chá.

> **Nota de contexto**: "chá de cogumelo para restaurar poderes" tem leitura adulta óbvia. É
> exatamente a referência de Alice e para criança lê como poção, mas vale saber que a leitura existe
> antes de virar material de divulgação.

---

## 6. Alertas de flanco e por que girar

Único elemento novo de UI, e a peça central da mecânica.

- Seta na borda lateral + contador numérico.
- Áudio espacial (Babylon `Sound` com `spatialSound`): o jogador ouve o que não vê. Maior ganho de
  imersão por menor custo técnico neste stack.
- Dispara também para inimigos ocultos atrás da torre (ver §2.2).

### O que só se descobre olhando

A seta diz **quantos**. Não diz **quais** nem **como estão dispostos**. Sem isso o jogador giraria
por reflexo, largaria tropa e giraria de novo — gerenciamento de contador, não leitura de espaço.

Girar revela:

- **espécie** dos inimigos (define qual carta usar);
- **distância real** (três longe ≠ um a meio metro da torre);
- **formação** (define o ponto ideal de colocação — atrás, na frente, no meio).

A terceira é a mais forte, porque usa o sistema de colocação que já existe: se onde colocar importa,
olhar importa.

A **carta de informação** revela espécie, não quantidade — a seta já cobre a quantidade.

---

## 7. Cartas: o eixo de design

Na v1 a carta era "dano por custo". Aqui o eixo é **atenção**: essa carta me libera de olhar, ou
exige que eu olhe?

| Tipo | Comportamento | Trade-off |
|---|---|---|
| **Autônoma** | segura um flanco sem supervisão | dano baixo |
| **Dependente de mira** | só age (ou carrega) enquanto enquadrada | dano alto, prende num setor |
| **Informação** | revela espécie dos inimigos fora do FOV | custo de slot sem poder de fogo |
| **Negação de espaço** | bloqueia um flanco por tempo | compra enquadramento, não mata |

Mão de 4 slots: com 3 flancos, são 3 de cobertura + 1 de reação.

Montar deck deixa de ser "juntar os mais fortes" e vira **cobrir 180° com um par de olhos só**.

### Estoque

- Sistema de dupla camada mantido: registro permanente no álbum ≠ cópias consumíveis em estoque.
- **Sobreviventes voltam ao estoque.** Só é consumida a criatura que morre em batalha.

---

## 8. Economia de cartas

Este era o bloqueador: não havia entrada de cartas no game loop.

### Entradas

| Fonte | Regra | Frequência |
|---|---|---|
| **Derrotado vira carta** | toda criatura inimiga abatida entra no álbum | contínua |
| **Coelho Maluco** | derrotar o chefe registra ele no álbum | só em vitória |
| **Cogumelo roxo** | estoque zerado → nasce; dá 1 carta aleatória | só em falência |

### Regra crítica

**Derrotados viram carta mesmo em derrota.** A primeira partida quase certamente termina com o
jogador perdendo. Se ele sai sem nada, o jogador está perdido. Se sai com 2 cartas, entendeu o jogo
e quer voltar.

### Cogumelos no chão

| Tipo | Efeito | Frequência |
|---|---|---|
| **Verde** | acelera a fermentação do chá | frequente |
| **Roxo** | 1 carta aleatória | raro, só na falência |

Coletar = apontar e tocar; o cogumelo voa sozinho até o caldeirão. Para que a coleta tenha risco,
**o verde nasce atrás dos inimigos** — coletar exige olhar por cima da ameaça.

---

## 9. Fluxo completo da partida

### Ato 1 — o jogo chama
1. **Menu**: sem tela de menu. Câmera aberta na sala real, um botão.
2. **Calibração**: coaching overlay, detecção de plano.
3. **A torre cogumelo brota** (1,20 m). Áudio espacial de banho vindo de algum canto — o jogador
   ouve antes de ver e procura com o celular.
4. **Ele enquadra o Coelho** tomando banho no chapéu do cogumelo.

### Ato 2 — constrangimento vira guerra
5. **O gatilho é enquadrar** (1–2 s contínuos, para não disparar por acidente). Reação gradual: para
   de cantar → olha de lado → encara.
6. **O chão racha**: fenda abre no piso real. Momento de captura/compartilhamento.
7. **A arena fecha** em 180° ao redor do jogador, onde ele já está. Caldeirão ao lado.
8. **Mão com 1 carta só** — slots vazios comunicam despreparo sem texto.

### Ato 3 — o loop
Alerta → girar → ler a formação → colocar tropa → coletar cogumelo → beber chá quando der.

### Ato 4 — a coleção
Fim de partida → cartas conquistadas → álbum → jogar de novo.

### Sobre o tutorial

Não existe tutorial explícito. O som ensina a procurar apontando. O enquadramento que dispara o jogo
ensina que enquadrar é a mecânica. A mão com uma carta ensina que falta coleção.

A placa de "cuidado" permanece **apenas como cenário** — piada de fundo para quem chegar perto. Não
é mais gatilho de nada, porque exigir aproximação criava um problema de recuo depois (o jogador
ficaria colado numa torre de 1,20 m sem espaço para a arena).

---

## 10. Design do momento Alice

O mundo não nasce sozinho — nasce porque o jogador olhou.

O gatilho ser *enquadrar* é o que amarra tudo: a primeira ação da partida é exatamente a ação que
ele repetirá centenas de vezes. E é uma interação que **só existe em AR** — apontar a câmera para
algo é um ato físico, não um botão.

---

## 11. Comparação honesta com Spatial Zombies (Quest 3)

Referência de sensação, **não** de paridade técnica.

| | Quest 3 | 8th Wall + smartphone |
|---|---|---|
| Malha do ambiente | scene mesh completo (paredes, móveis) | apenas planos horizontais estimados |
| Oclusão | Depth API por pixel | **não existe** |
| FOV / mãos | passthrough estéreo ~110°, mãos livres | janela de 6", uma mão ocupada |

Zumbi atravessando a parede real depende 100% de scene mesh. **Isso não será reproduzido.**

Aproveitável e presente nesta spec: escala de sala, ameaça vinda de fora do enquadramento, oclusão
falsa por distância, áudio espacial.

---

## 12. Ordem de implementação

1. Arena 180° com 3 setores + spawn nunca no flanco enquadrado
2. Escala nova (torre 1,20 m, tropa 0,35 m) + blob shadow + fade por proximidade
3. Alertas de flanco (seta + contador) e áudio espacial
4. Colocação direta no chão com anel + raio mínimo + débito automático
5. Cartas presas ao jogador; remoção da barra inferior e da barra de elixir
6. Caldeirão fermentador: coleta de verde, som de torradeira, beber instantâneo
7. Economia: derrotado → carta, cogumelo roxo na falência
8. Intro (torre brota → som de banho → enquadrar → fenda → arena fecha)
9. Álbum e tela de fim de partida

**Passos 1–4 provam a tese.** Se a mecânica de atenção não for divertida ali, o resto não salva.

---

## 13. Em aberto

- **Coelho na arena fechada.** Onde ele fica? Flanco central fixo torna os laterais decoração;
  circular obriga perseguição e impede defender. Não resolvido.
- **Hierarquia de áudio.** Alerta de flanco, tropa e torradeira competem — provavelmente em ambiente
  barulhento de festa. Definir prioridades antes de implementar o passo 6.
- **Duração da partida.** 3–4 min é o teto confortável com o celular na mão. Define se o Coelho é
  clímax depois de ondas ou presença constante.
- **Mirar longe vs. ler cartas.** Exigem inclinações opostas do celular. Definir se as cartas sob
  fade durante a mira.
- **Tuning do cogumelo verde.** Ou coletar vale sempre a pena (e o jogador ignora a defesa), ou nunca
  vale (e vira ruído). Nascer atrás dos inimigos ajuda, mas o valor exato precisa de playtest.
- **Condição de derrota.** Torre cair, ou estoque zerar? Recomendação: torre cair, com o cogumelo
  roxo evitando a segunda.
- **Arco real confortável.** 180° ou 120°. Só o protótipo com o corpo responde.
- **Coelho para crianças.** 0,70 m a 1 m de distância pode intimidar em festa infantil. Testar.

### Adiado: livro de cartas

Um livro aberto flutuando à esquerda, preso ao jogador, substituiria a mão e o álbum por um objeto
único: quatro cartas nas páginas abertas, cartas novas voando para dentro dele durante o combate,
slots vazios visíveis, e o próprio livro servindo de referência visual de orientação. Seria o Greed
Island completo e eliminaria a única tela 2D restante.

Fora do MVP — adiciona superfície que ainda não precisa existir. Revisitar depois que os passos 1–4
estiverem validados.
