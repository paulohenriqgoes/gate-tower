# RA-F7.b — Reescrever as skills a partir da API, nao da cicatriz

**Objetivo:** as skills de RA deixam de ensinar a **medir** o piso e passam a
ensinar a **declara-lo**. Este e um objetivo declarado do projeto: produzir
skills que permitam construir jogos de RA com 8th Wall + Babylon sem cair nas
armadilhas que este projeto ja pagou.

## Ponto de partida

- `grep -c "hitTest" .claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md`
  devolve **9** — a skill ainda ensina fit de piso por `hitTest`, um pipeline que
  a RA-F2 removeu inteiro do projeto;
- **ja existe e esta pronto**:
  `.claude/skills/babylonjs-game-dev/references/8thwall-api-surface.md`, 854
  linhas com **procedencia por simbolo** (o que veio do bundle, o que veio da
  doc). E o insumo desta reescrita;
- a **RA-F7.a ja saiu** (`9ba9e7a`): as duas chamadas mortas (`imageTargets`
  no-op e `recenterWithOrigin` inexistente) foram corrigidas. O que sobra e a
  reescrita estrutural.

## Arquivos-alvo

`.claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md` (reescrita),
`.claude/skills/babylonjs-game-dev/references/8thwall-anchoring.md` (novo),
`.claude/skills/babylonjs-game-dev/SKILL.md` (indice).

## Contrato

`8thwall-anchoring.md` abre com **a escolha de referencial** como a primeira
decisao de um jogo de RA: conteudo autorado na origem versus posicionado por
medicao. `recenter()` entra como **primitiva de colocacao**; image target entra
como a resposta certa para outra classe de problema; `hitTest` e **rebaixado a
consulta pontual sobre geometria**, nunca fundacao de grounding.

Entra o **mapa honesto do que o binario nao tem**: meshing de sala, depth,
oclusao, classificacao de superficie, anchor persistente. Os eventos `mesh*` sao
do caminho VPS/wayspot, e `enableVps: true` emite
`console.error("[XR] VPS is not supported in standalone mode.")` — VPS esta fora.

Entram os tres bugs que a spec 08 encontrou: ordem de carregamento do
`window.BABYLON`, ramo destro do modulo Babylon quebrado (quaternion NaN), e o
par sinal/zero do azimute.

### O que TEM de sobreviver a reescrita

Nenhum destes esta errado; todos mudam de lugar. Perder qualquer um custa
repetir um ciclo de investigacao ja pago.

- **silencio de sensor nao e evidencia** — gate por prova positiva produziu 79
  recusas e zero ancoragens em dois testes de device;
- **tilt medido nunca aplicado na cena** — a mediana do fit e 13 graus, com picos
  de 48; e ruido, nao geometria;
- **limiar em graus carrega raio implicito** — 12 graus valem 8 cm numa arena de
  80 cm e **47 cm** num arco de 2,2 m de raio. Um limiar angular herdado de outra
  escala e um limiar errado;
- **`hitTest` precoce estoura o WASM** e mata o app; sempre em `try/catch`;
- **normalizacao em px CSS** (`clientWidth`/`clientHeight`), nao em px de device;
- **`FEATURE_POINT` nao se remove** da lista de tipos aceitos — sem ele o
  `hitTest` emudece. Vale mais que o argumento teorico de que feature point nao e
  superficie.

### O item a REBAIXAR, sem apagar e sem promover

**"Esconda o chao virtual opaco em AR"** (hoje na linha 204). E **heuristica do
autor do projeto**, nao achado medido — confirmado por ele em 2026-08-19 — e ha
contra-evidencia: experiencias de mini golf em RA poem o percurso no chao e
funcionam.

O que a medicao sustenta e mais estreito: **linha fina e extensa vista em
incidencia rasante amplifica erro de pose**, por geometria projetiva. E por isso
que julgar ancoragem por um anel deitado a 2,2 m e cruel, e por isso que o spike
passou a usar totens verticais com pe visivel. Mas amplificar o sintoma nao e o
mesmo que proibir conteudo no piso.

Mantenha o texto, marcado como heuristica de origem conhecida e sem medicao, e
ponha ao lado o achado medido — que e sobre **escolha de alvo para diagnosticar
deriva**, nao sobre design de arte.

### A meta-licao, explicita

Skill escrita so a partir da experiencia da sessao **consolida o caminho errado**
se nunca for confrontada com a superficie de API e com o codigo oficial. Foi
exatamente o que aconteceu aqui: o projeto passou semanas melhorando a medicao de
um piso que o engine nunca pediu para medir.

## Criterio de aceite

`grep -n "hitTest" ar-xr-8thwall.md` so devolve ocorrencias no contexto de
"consulta pontual", nunca de grounding. Todos os aprendizados da lista acima
existem no arquivo novo, encontraveis por busca. A meta-licao esta escrita.

## Como validar

Leitura, mais o teste real: pegar a spec 08 e perguntar se alguem que so leu as
skills novas teria caido em algum dos tres bugs. Se sim, falta conteudo.

## Fora de escopo

Diario e `README.md` — isso e trabalho da skill `encerrar-sessao`. O quadro deste
diretorio — quem o atualiza tambem e ela.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| Reescrita e reparticionamento das skills de RA | execucao direta | `opus` — decide o que o projeto vai acreditar sobre RA daqui para frente; erro aqui contamina toda sessao futura | — |
| Atualizar indice e links da `SKILL.md` | `general-purpose` | `haiku` — mecanico, alvo definido pela tarefa acima | — |

## Depende de

A evidencia de device acumulada ate a Onda C do quadro (RA-F2 fechada, RA-F3 e
RA-F4 validadas). O que a skill vai afirmar sobre ancoragem precisa ter sido
visto funcionando, e nao apenas compilado.
