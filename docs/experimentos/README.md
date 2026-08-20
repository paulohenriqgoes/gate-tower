# Diarios de experimento

Cada arquivo aqui e o diario de **uma linha de investigacao**, e ele guarda duas
coisas: o **resumo de cada sessao** e o **progresso de validacao das hipoteses**.
E a memoria do projeto sobre o que ja se sabe e como se soube — inclusive as
conclusoes que foram desmentidas depois.

**Diario nao e changelog.** O `git log` ja registra o que mudou; o diario
registra o que aquilo **ensinou**. Uma entrada sem "Provou" nao deveria estar
aqui.

**Diario tambem nao e spec.** Ele nao carrega passo de execucao, contrato,
criterio de aceite, ordem de ondas nem tabela de "o que esta pronto". Isso e
trabalho do diretorio de specs, e quando as duas coisas moraram no mesmo arquivo
elas divergiram — o diario da v3 chegou a dizer "sem commit" para trabalho ja
commitado. Uma entrada responde *o que aprendemos*; uma spec responde *o que
fazer*.

## Indice

| Tema | Arquivo | Status | Ultima atualizacao |
| --- | --- | --- | --- |
| Arena de 180 graus e atencao como recurso | [arena-180-atencao.md](arena-180-atencao.md) | ativo | 2026-08-20 |
| A demo do mundo vivo | [demo-mundo-vivo.md](demo-mundo-vivo.md) | encerrado | 2026-08-17 |
| Arena estavel em RA e layout paisagem | [ra-e-paisagem.md](ra-e-paisagem.md) | ativo | 2026-08-12 |
| Ferramental de registro entre sessoes | [ferramental-de-sessao.md](ferramental-de-sessao.md) | ativo | 2026-08-06 |

Para a v3, o quadro de estado e
[`docs/specs-arena-180/README.md`](../specs-arena-180/README.md).

A demo do mundo vivo foi encerrada em 2026-08-17 **por mudanca de direcao, nao
por resposta**: a spec v3 aposentou a arena de mesa, e a pergunta que aquele
diario media ficou sem medicao valida. O historico de RA dele continua valendo —
e onde estao a calibracao, o gate de colocacao e as armadilhas de GUI.

`Status` e um destes tres:

- **ativo** — a investigacao continua; a secao "Proximos passos" do diario vale.
- **encerrado** — a pergunta foi respondida e o resultado ja esta no codigo e no
  `README.md`. O diario fica como historico.
- **revogado** — a conclusao principal caiu. O diario continua aqui, com a
  revogacao marcada in loco, porque saber que uma hipotese foi descartada evita
  que alguem a persiga de novo.

## Convencoes

- Nome de arquivo: `<tema-kebab>.md`, sem data. O tema vive mais que a sessao.
- Um diario por **tema**, nao por sessao nem por branch. Se o assunto da sessao
  nao cabe em nenhum diario existente, abra um novo e registre-o na tabela acima.
- O formato de cada entrada esta em
  `.claude/skills/encerrar-sessao/references/formato-diario.md`. A skill
  `encerrar-sessao` escreve por esse formato.
- Conclusao superada **nao e apagada**: ela ganha um aviso no lugar onde esta,
  apontando para a entrada que a revogou.
