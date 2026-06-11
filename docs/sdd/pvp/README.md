# SDD PvP

## Objetivo

Documentar a execucao do plano PvP do Tower Gate em fases pequenas, rastreaveis e reutilizaveis.

## Como usar

1. Execute as fases na ordem listada abaixo.
2. Nao avance para a proxima fase sem fechar os criterios de aceite da fase atual.
3. Quando uma fase alterar contratos de dominio, atualize os SDDs seguintes antes de implementar.
4. Use os arquivos desta pasta como checklist tecnico e como base para handoff.

## Estado atual do projeto

- Fase 01 ja possui base implementada no codigo atual.
- Fases 02 a 07 permanecem planejadas.
- O projeto ainda nao possui fluxo PvP jogavel ponta a ponta.

## Sequencia de execucao

| Fase | Arquivo | Status | Dependencias principais |
| --- | --- | --- | --- |
| 01 | `01-simulacao-deterministica.md` | Base pronta | Nenhuma |
| 02 | `02-modelo-autoritativo-local.md` | Pendente | Fase 01 |
| 03 | `03-perspectiva-por-jogador.md` | Pendente | Fase 02 |
| 04 | `04-target-deterministico.md` | Pendente | Fase 02 |
| 05 | `05-pareamento-qr.md` | Pendente | Fase 02 |
| 06 | `06-sincronizacao-webrtc.md` | Pendente | Fases 02, 03, 04, 05 |
| 07 | `07-reconciliacao-e-qa.md` | Pendente | Fase 06 |

## Decisoes de produto e arquitetura

- O host e a fonte da verdade da partida.
- A rede troca comandos e eventos, nao o estado bruto a cada frame.
- A simulacao deve ser deterministica e baseada em tick fixo.
- Cada cliente precisa ver sua propria base embaixo da arena.
- Snapshots periodicos existem para reconciliacao, nao como mecanismo principal de jogo.

## Observacoes

- O codigo atual ja possui um relogio de simulacao em `src/battle/SimulationClock.ts`.
- A documentacao desta pasta foi escrita para o estado do repositorio em `2026-06-10`.
