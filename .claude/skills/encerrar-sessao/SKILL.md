---
name: encerrar-sessao
description: Encerramento de sessao deste projeto (Tower Gate) — transforma o que foi feito na sessao em registro duravel. Atualiza o diario de experimento em docs/experimentos/, o Estado Atual e o Roadmap do README.md, e revisa as skills e memorias existentes procurando o que a sessao contradisse ou revelou de lacuna. Use SEMPRE que o usuario disser "encerrar sessao", "fechar o dia", "terminamos por hoje", "atualiza as docs", "documenta o que fizemos", "registra o progresso", "atualiza o README com o andamento", "revisa as skills" ou pedir para consolidar aprendizados antes de parar. Use tambem antes de um commit de documentacao que pretenda resumir a sessao. NAO use para escrever spec de implementacao (isso e planejamento-por-etapas), para commitar codigo, nem para gerar changelog — diario nao e changelog.
---

# Encerrar Sessao — Tower Gate

Esta skill existe porque o registro do projeto envelhece mal sozinho. O `git log`
guarda o que mudou, mas nao guarda **o que aquilo ensinou** — e e o aprendizado
que evita repetir um ciclo de investigacao ja pago.

Ela tem um caso fundador neste repo: a entrada do commit `ed93779` em
`docs/experimentos/ra-e-paisagem.md` registrou como conclusao ("RA nao funciona
em paisagem") algo que era, na verdade, um resultado obtido sem o gate de
calibracao. A conclusao teve que ser revogada depois. Todo o rigor abaixo existe
para que a proxima entrada nao precise da mesma correcao.

## O que ela faz e o que ela nao faz

**Faz:** coleta a evidencia da sessao, classifica cada achado por forca de
prova, escreve a entrada do diario, atualiza o README, e aponta skills e
memorias que ficaram desatualizadas.

**Nao faz:** commit, push, alteracao de codigo de producao, nem edicao de skill
ou memoria sem aprovacao explicita do usuario.

## Referencias

Leia sob demanda, na fase em que cada uma entra:

| Arquivo | Quando ler |
| --- | --- |
| `references/coleta-de-evidencias.md` | Fase 0 — o que conta como prova, e como perguntar o que nao da para inferir |
| `references/formato-diario.md` | Fase 2 — anatomia do diario e templates de entrada |
| `references/revisao-de-skills-e-memoria.md` | Fase 4 — diario vs. memoria vs. skill, e varredura de contradicao |

## As quatro regras invioláveis

Valem em todas as fases. Se uma delas conflitar com o que o usuario pediu,
pergunte antes de escrever.

1. **Nada de "funciona" sem device.** Este repo proibe validar RA no desktop —
   o SLAM so roda no celular (`docs/specs/README.md`, convencao 6). Codigo que
   apenas compilou se escreve "implementado; compila; nao testado em device".
   Nunca "funciona", nunca "resolvido".
2. **Revogar, nunca apagar.** Conclusao superada continua no diario com um aviso
   in loco marcando-a como revogada e apontando a entrada que a derrubou. Saber
   que uma hipotese caiu vale tanto quanto saber qual venceu.
3. **Sem invencao.** Toda afirmacao registrada aponta para um commit, um
   `arquivo:linha`, ou uma fala do usuario. Se nada sustenta, a afirmacao e
   hipotese — vai para "Hipoteses vivas", com o teste que a decide.
4. **Nao commite.** A skill termina com o resumo do que mudou e a mensagem de
   commit sugerida. Quem commita e o usuario.

## Procedimento

### Fase 0 — Coleta

Leia `references/coleta-de-evidencias.md` antes de comecar.

Determine o intervalo da sessao (`git log --oneline`, `git status --short`,
`git diff --stat`), liste os arquivos tocados agrupados pelos modulos
obrigatorios do projeto (AR Manager, Arena System, Unit Factory, Combat Engine,
HUD), e varra a conversa por decisoes tomadas, tentativas que falharam e
resultados de teste em device.

**Pergunte o que nao da para inferir.** A pergunta que mais importa e sempre a
mesma: *isto chegou a ser testado no celular, ou so compilou?* Perguntar custa
uma linha; registrar suposicao como fato custa uma revogacao depois.

### Fase 1 — Classificacao

Cada achado da coleta vira exatamente um destes:

- **Feito** — a mudanca em si.
- **Provou** — o que a mudanca ensinou. E o campo que justifica o diario existir.
- **Nao resolveu** — a tentativa que falhou, com detalhe suficiente para ninguem
  repetir o ciclo.
- **Revoga** — a conclusao anterior que este resultado derruba, com o ponteiro
  para onde ela esta escrita.

Achado que nao se encaixa em nenhum e provavelmente changelog. Descarte.

### Fase 2 — Diario

Leia `references/formato-diario.md`.

Escolha o destino: **anexar** ao diario do tema vigente, ou **abrir um diario
novo** quando o assunto nao pertence a nenhum existente. Um diario por tema,
nunca por sessao. O indice fica em `docs/experimentos/README.md`.

Escreva a entrada na linha do tempo e atualize, no mesmo passo, *Estado atual*,
*Hipoteses vivas* e *Proximos passos* — um diario cuja entrada nova contradiz a
tabela de estado logo abaixo e pior que nenhum diario. Atualize tambem a data e
a linha do indice.

### Fase 3 — README

Atualize `README.md`:

- **Estado Atual** — o foco vigente e a lista de entregas concluidas;
- **Roadmap de Fases** — a tabela; marque `[x]` so quando o criterio de conclusao
  da fase foi de fato satisfeito, `[~]` para parcial (dizendo o que falta), e
  mexa em secoes de comportamento (RA, orientacao, tela cheia) apenas quando o
  comportamento mudou de verdade.

A regra 1 vale aqui com forca dobrada: o README e o primeiro arquivo que um agent
novo le, e um "funciona" errado nele contamina todas as sessoes seguintes.

### Fase 4 — Revisao de skills e memorias

Leia `references/revisao-de-skills-e-memoria.md`.

Duas varreduras:

- **Contradicao** — para cada skill e memoria que toca o assunto da sessao,
  confronte as afirmacoes fortes dela com o que a sessao mostrou. Contradicao
  nao aparece sozinha; ela so surge quando alguem compara de proposito.
- **Lacuna** — algo se repetiu ou foi corrigido de novo? Pode ser procedimento
  querendo virar skill. Caso unico nao vira skill.

Apresente cada achado como proposta — alvo, o que esta la hoje, a evidencia que
derruba, o patch, e o custo de nao fazer — e **espere o OK antes de editar**.
Skill e memoria sao instrucao permanente: entram no contexto de toda sessao
futura, entao merecem porteiro.

### Fase 5 — Fechamento

Entregue, no chat:

1. a lista dos arquivos alterados, com uma linha do que mudou em cada;
2. as propostas da Fase 4 que continuam pendentes de decisao;
3. o que ficou **aberto** para a proxima sessao — o mesmo conteudo de "Proximos
   passos" do diario, para o usuario nao precisar abrir o arquivo;
4. a mensagem de commit sugerida, no formato do repo (`DOC:` para atualizacao de
   documentacao), em portugues do Brasil.

E pare. O commit e do usuario.

## Convencoes de escrita

- Portugues do Brasil, **sem acentos** no conteudo dos documentos — e o estilo
  de todo o repo.
- Sem emoji.
- Datas absolutas (`2026-08-06`), nunca "ontem" ou "semana passada": o documento
  sera lido meses depois.
- Comentario e texto explicam o *porque*. O *o que* o codigo e o `git log` ja
  contam.
