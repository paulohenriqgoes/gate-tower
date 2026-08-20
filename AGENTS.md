# Instruções para Agents de IA

## Antes de qualquer ação

1. **Leia `.github/copilot-instructions.md`** — contém as regras obrigatórias de arquitetura, tecnologias, padrões de código e convenções do projeto.
2. **Leia `README.md`** — contém o objetivo do projeto, estado atual, roadmap e instruções de execução.
3. **Para qualquer trabalho na v3 (arena de 180°), leia `docs/specs-arena-180/README.md`** — é a única fonte de verdade sobre o que já está pronto e o que falta. Não reconcilie estado a partir de outros documentos: se algum deles discordar do quadro, o quadro está certo.

As diretrizes definidas nesses arquivos são **mandatórias** e devem ser seguidas em todas as interações.

## Ao planejar

Todo planejamento deste projeto usa a skill **`planejamento-por-etapas`**
(`.claude/skills/planejamento-por-etapas/SKILL.md`). Nenhum plano é apresentado
sem spec por etapa, sub-agents declarados com o modelo escolhido para cada tarefa
e decisão explícita de paralelismo.

## Ao encerrar

Todo encerramento de sessão usa a skill **`encerrar-sessao`**
(`.claude/skills/encerrar-sessao/SKILL.md`). Ela converte o que a sessão fez em
registro durável: entrada no diário de `docs/experimentos/`, progresso no
`README.md`, e revisão das skills e memórias que a sessão contradisse. Ela
escreve e para para revisão — não commita.
