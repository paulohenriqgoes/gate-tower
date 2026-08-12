# Diarios de experimento

Cada arquivo aqui e o diario de **uma linha de investigacao**: o que foi
tentado, o que cada tentativa provou e o que ainda esta aberto — inclusive as
conclusoes que foram desmentidas depois.

Diario nao e changelog. O `git log` ja registra o que mudou; o diario registra o
que aquilo **ensinou**. Uma entrada sem "Provou" nao deveria estar aqui.

## Indice

| Tema | Arquivo | Status | Ultima atualizacao |
| --- | --- | --- | --- |
| A demo do mundo vivo | [demo-mundo-vivo.md](demo-mundo-vivo.md) | ativo | 2026-08-12 |
| Arena estavel em RA e layout paisagem | [ra-e-paisagem.md](ra-e-paisagem.md) | ativo | 2026-08-12 |
| Ferramental de registro entre sessoes | [ferramental-de-sessao.md](ferramental-de-sessao.md) | ativo | 2026-08-06 |

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
