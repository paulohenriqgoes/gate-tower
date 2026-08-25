# Revisao de skills e memoria

## 1. O que e / quando ler

Esta e a referencia da Fase 4 (REVISAO) da skill `encerrar-sessao`: o passo em
que se olha para o que a sessao acabou de aprender e se decide, com criterio
explicito, se algo disso deveria virar (ou corrigir) uma instrucao permanente
do projeto — em vez de so ficar registrado como historia no diario. Leia este
arquivo sempre que a Fase 4 for executada.

## 2. Os tres destinos

Todo aprendizado de uma sessao cai em um destino. O erro mais comum e escrever
tudo em memoria "para garantir" — isso polui o contexto de sessoes futuras com
coisa que ja esta no diario ou no codigo. O segundo erro, mais raro mas mais
caro, e promover um caso unico a skill.

| Destino | O que vai para la | Teste decisivo |
|---|---|---|
| **Diario** (`docs/experimentos/<tema>.md`) | o que foi tentado nesta linha de investigacao e o que provou — inclusive tentativas que nao resolveram e conclusoes que depois foram revogadas | "isto e a historia de um experimento?" |
| **Memoria** (memoria persistente do Claude) | fato duravel sobre o projeto ou o usuario que nao se deduz lendo o codigo nem o git | "um agent novo erraria por nao saber disto, e o repo nao conta essa historia sozinho?" |
| **Skill** (`.claude/skills/<nome>/`) | procedimento repetivel — algo que se FAZ de novo, do mesmo jeito, em sessoes futuras | "isto e uma instrucao de como agir, aplicavel a mais de uma sessao?" |

A maioria dos aprendizados de uma sessao fica no diario — e o destino default,
de menor custo, e o correto quando a duvida e "documento isso ou nao?". Skill e
o destino mais caro e mais raro: e instrucao permanente, entra no contexto de
TODA sessao futura que bater no gatilho da description, e por isso precisa
justificar esse custo (secao 4). Memoria fica no meio: mais barata que skill
(so carrega quando relevante ao tema), mas ainda assim persiste entre sessoes
e projetos — nao deve virar um segundo diario.

Exemplos concretos deste projeto, para calibrar o julgamento:

- **Diario**: `docs/experimentos/ra-e-paisagem.md` inteiro. Cada entrada e
  presa a um commit (`abac587`, `ed93779`, `d3354a9`, `49a8b44`), narra o que
  foi feito, o que o resultado em device provou, e o que **nao** resolveu. E
  historia de investigacao, nao instrucao de acao — por isso e diario, mesmo
  contendo achados tecnicos importantes.
- **Memoria**: as entradas listadas no `MEMORY.md` do usuario —
  `8thwall-binary-api`, `arena-drift-fix`, `arena-anchor-place-once`,
  `landscape-ar-incompativel`, `coaching-overlay-criterio-normal`,
  `hud-ideal-resolution-portrait`. Sao fatos pontuais, cada um sintetizando o
  resultado de um experimento (nao o processo), curtos o bastante para nao
  virar um segundo diario.
- **Skill**: `.claude/skills/babylonjs-game-dev/` (como estruturar e depurar
  Babylon.js + 8th Wall — procedimento que se repete em qualquer tarefa de
  arquitetura, performance ou AR/XR deste projeto) e
  `.claude/skills/planejamento-por-etapas/` (formato obrigatorio de todo plano
  do projeto). Ambas descrevem COMO agir, nao O QUE aconteceu numa sessao
  especifica.

Um jeito rapido de nao errar o destino: se a frase que voce quer registrar
comeca com "na sessao de hoje, tentamos..." e diario. Se comeca com "o projeto
sempre..." ou "o usuario prefere..." e memoria. Se comeca com "sempre que for
fazer X, faca assim..." e candidato a skill — mas so vira skill se passar pelo
filtro da secao 4.

## 3. Varredura de contradicao

Este e o passo mais importante da Fase 4, e o unico que exige acao ativa em
vez de so registrar coisa nova: uma sessao pode ter provado que uma skill ou
memoria **ja existente** esta errada. Isso nao aparece sozinho — ninguem le a
memoria antiga toda vez que fecha uma sessao nova, entao a contradicao fica
enterrada ate alguem confrontar deliberadamente o registro velho com o
resultado de hoje. E exatamente isso que este passo faz.

Procedimento:

1. Liste as skills e memorias que tocam o assunto da sessao (busque por tema,
   nao so por nome exato — uma sessao sobre orientacao de tela toca memorias
   sobre RA, sobre HUD e sobre o binario do 8th Wall).
2. Para cada afirmacao forte dessas skills/memorias, pergunte: a sessao de
   hoje **confirmou**, **refinou** ou **contradisse** isto?
3. Quando contradisse, monte o par **afirmacao atual -> evidencia que a
   derruba**, com ponteiro para commit, arquivo ou entrada de diario. Esse par
   e o que vai para a proposta da secao 5 — nao edite a memoria ou a skill
   diretamente aqui.

### Caso real (exemplo trabalhado)

Este e o padrao exato que o passo 3 precisa pegar:

- **Afirmacao atual** — a memoria `landscape-ar-incompativel` diz, na sua
  primeira linha de corpo: *"o HUD e o fullscreen ficaram bons, mas o modo RA
  fica quebrado demais em landscape — objetos deslizam a qualquer movimento e
  o tracking perde orientacao. Em portrait o mesmo codigo de RA funciona."*
- **Evidencia que derruba** — `docs/experimentos/ra-e-paisagem.md`, entrada do
  commit `49a8b44` (linhas 101-109), item 2 dos resultados: *"Paisagem em RA
  funciona. Com a tela destravada (...) tanto paisagem quanto portrait rodam
  bem. A conclusao de `ed93779` esta revogada na forma 'RA nao funciona em
  paisagem'."* O proprio diario ja registrou o aviso, na entrada anterior
  (linhas 57-63): *"a conclusao registrada na epoca foi 'RA nao funciona em
  paisagem'. Ela envelheceu mal (...) Naquele momento nao existia gate de
  calibracao (...) O experimento estava medindo duas coisas ao mesmo tempo e
  creditando o resultado a uma so."*
- **O que realmente quebra** — nao e a orientacao paisagem em si, e trocar de
  orientacao com a sessao de RA no ar (mesma entrada, linhas 110-112).

A memoria `landscape-ar-incompativel` ainda nao foi corrigida para refletir
isso — ela guarda a conclusao velha como fato do projeto, e um agent novo que
so ler a memoria (sem cruzar com o diario) vai evitar paisagem em RA por um
motivo que ja foi refutado. Esse e exatamente o tipo de gap que a Fase 4 existe
para fechar: nao basta a informacao nova existir em algum lugar do repo, ela
precisa chegar ate o registro permanente, ou o registro permanente mente por
omissao. Se ao rodar a Fase 4 essa contradicao ainda estiver de pe, ela e
propriamente um item a propor (secao 5), com a afirmacao atual, a evidencia
acima e o patch sugerido.

## 4. Sinais de que algo deveria virar skill nova

Sinais objetivos de que vale propor skill nova (ou editar uma existente):

- o usuario corrigiu o **mesmo** comportamento em duas sessoes diferentes —
  sinal de que a instrucao nao esta em lugar nenhum permanente, entao cada
  sessao reincide;
- existe uma sequencia de passos que ja foi repetida e refeita de memoria mais
  de uma vez (ex.: um checklist de validacao em device, um roteiro de debug);
- existe um erro que agents cometeram mais de uma vez pela mesma razao
  estrutural — nao um bug local, mas uma suposicao errada sobre como o
  sistema funciona (o tipo de coisa que `d3354a9` corrigiu ao documentar como
  o bundle do 8th Wall realmente consome orientacao).

O que **nao** vira skill:

- caso unico, mesmo que tecnicamente rico — isso e diario;
- decisao especifica de um arquivo ou de uma linha de codigo — isso e o
  proprio codigo, ou no maximo um comentario nele;
- fato sem procedimento associado (uma preferencia, uma restricao, um numero)
  — isso e memoria, nao skill.

Skill nova e o destino mais caro deste documento porque ela entra no contexto
de toda sessao futura cuja `description` bater com o gatilho — uma skill sobre
um caso unico e ruido permanente, nao ajuda. Na duvida, prefira editar uma
skill existente (ex.: acrescentar uma secao em
`ar-drift-e-grounding.md`) a criar uma pasta nova.

## 5. Como propor uma alteracao

A Fase 4 **apresenta** a proposta ao usuario e **so edita** skill ou memoria
depois do OK explicito dele. Skill e memoria sao instrucao permanente e
merecem porteiro — a Fase 4 nao e autorizada a escrever nesses arquivos por
conta propria, mesmo quando a contradicao da secao 3 parece obvia.

Formato de cada proposta:

```
Alvo: <arquivo, ex. memoria landscape-ar-incompativel ou
       skill .claude/skills/babylonjs-game-dev/references/ar-drift-e-grounding.md>

O que esta la hoje:
  <citacao literal da afirmacao atual>

O que a sessao mostrou:
  <o resultado novo, com ponteiro para commit/arquivo/diario>

Patch proposto:
  <o texto novo, ou o diff da secao que muda>

Custo de nao fazer:
  <o que um agent futuro vai errar se isso ficar como esta>
```

Uma sessao pode gerar zero, uma ou varias propostas. Zero e um resultado
valido — nem toda sessao produz aprendizado duravel o bastante para memoria
ou skill.

## 6. Anatomia de uma skill deste repo

Para o caso de uma proposta da secao 5 virar skill nova (raro — ver secao 4),
o padrao deste repo, exemplificado por
`.claude/skills/babylonjs-game-dev/SKILL.md`:

- **Frontmatter obrigatorio**: `name` em kebab-case, identico ao nome da pasta
  (`.claude/skills/babylonjs-game-dev/SKILL.md:2` tem `name: babylonjs-game-dev`);
  e `description` que enumera os gatilhos em linguagem natural — os
  substantivos e pedidos que devem acionar a skill (`SKILL.md:3`: "Use ao criar
  um projeto Babylon.js, estruturar cenas/estados/entidades, otimizar
  performance (...) Acione TAMBEM para qualquer pedido de AR (...)") **e** diz
  explicitamente quando NAO acionar (mesma linha, ultima frase: "Nao necessaria
  para perguntas triviais e pontuais da API que nao envolvam arquitetura,
  performance, AR/XR ou organizacao de projeto"). As duas metades importam
  igual — sem a segunda, a skill dispara demais e vira ruido no contexto de
  sessoes que nao precisam dela.
- **Corpo curto**: o `SKILL.md` em si e um indice — explica quando usar cada
  arquivo de referencia (`SKILL.md:18-26`, a tabela de referencias) e lista
  principios curtos que atravessam todo o dominio (`SKILL.md:28-35`). Ele nao
  carrega o material tecnico extenso.
- **Material longo em `references/`, carregado sob demanda**: cada arquivo
  cobre um subdominio (`project-setup.md`, `architecture.md`,
  `ui-e-texto-em-ar.md`, `8thwall-api-surface.md`, `ar-drift-e-grounding.md`) e so e lido
  quando a tarefa cai naquele subdominio — este proprio arquivo que voce esta
  lendo segue o mesmo padrao dentro de `encerrar-sessao/references/`.

`planejamento-por-etapas` segue a mesma anatomia em escala menor: frontmatter
com gatilhos explicitos e contra-exemplo ("Nao e necessaria para pergunta
pontual, leitura de codigo ou correcao de uma linha" —
`.claude/skills/planejamento-por-etapas/SKILL.md:3`), corpo unico sem
`references/` porque o assunto e pequeno o bastante para caber inteiro no
`SKILL.md`. Isso tambem e uma licao de anatomia: `references/` so se justifica
quando o material e grande o bastante para nao valer a pena carregar sempre.
