# SDD 03 - Perspectiva por jogador

## Status

- Estado no repositorio: pendente.

## Objetivo

Permitir que cada cliente veja sua propria base na parte de baixo da arena, sem alterar a verdade canonica do mundo.

## Problema que esta fase resolve

- O campo hoje parte de uma unica perspectiva fixa.
- O guest precisa enxergar o mundo de forma espelhada sem quebrar a simulacao.

## Escopo

- Definir coordenadas canonicas da partida.
- Definir transformacao de perspectiva local para render.
- Definir conversao de input local para coordenada canonica.
- Garantir que HUD, spawn e leitura de lanes respeitem o lado do jogador.

## Decisoes obrigatorias

- O estado autoritativo usa apenas um sistema canonico de coordenadas.
- A perspectiva e uma camada de apresentacao.
- O input local precisa ser convertido antes de virar comando de partida.

## Sugestao de modulos

- `src/pvp/PerspectiveMapper.ts`
- `src/pvp/PlayerViewModel.ts`
- `src/arena/ArenaViewAdapter.ts`

## Checklist de execucao

- [ ] Definir qual lado canonico pertence ao host e ao guest.
- [ ] Criar utilitarios de espelhamento de posicao e direcao.
- [ ] Adaptar input de deploy para converter a posicao local em coordenada canonica.
- [ ] Adaptar a camera e a leitura visual para o jogador local.
- [ ] Revisar nomes `player` e `enemy` para contratos neutros se necessario.

## Criterios de aceite

- Host ve sua base embaixo.
- Guest ve sua base embaixo.
- O mesmo comando canonicamente aplicado aparece no lado correto para cada cliente.
- O combate nao duplica logica por perspectiva.

## Validacao minima

- Testar o mesmo spawn canonico em duas perspectivas diferentes.
- Validar que lanes, torres e faixa de deploy permanecem coerentes.

## Riscos conhecidos

- O contrato atual `player` e `enemy` pode ficar pequeno demais para duas perspectivas reais.
- Esta fase pode exigir refatoracao de naming em `BattleTypes`.
