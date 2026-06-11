# SDD 01 - Simulacao deterministica

## Status

- Estado no repositorio: implementada como base inicial.

## Objetivo

Tirar o nucleo da partida da dependencia de FPS, `performance.now()`, `Date.now()` e aleatoriedade local nao controlada.

## Problema que esta fase resolve

- Resultados diferentes entre clientes quando o render oscila.
- Cooldowns e regeneracao acoplados ao tempo do navegador.
- IDs e variacoes de unidade impossiveis de reproduzir com seguranca em PvP.

## Escopo

- Introduzir um relogio de simulacao baseado em tick fixo.
- Fazer combate, movimento, spawn e mana responderem a ticks.
- Trocar geracao aleatoria local por seeds deterministicas por unidade.
- Preparar o combate para receber comandos enfileirados.

## Arquivos impactados no estado atual

- `src/battle/SimulationClock.ts`
- `src/main.ts`
- `src/combat/CombatEngine.ts`
- `src/cards/CardDeckSystem.ts`
- `src/units/BaseUnit.ts`
- `src/units/UnitFactory.ts`
- `src/towers/TowerActor.ts`

## Entregaveis

- Tick fixo de simulacao.
- Regeneracao de mana em tick.
- Cooldown de unidades e torres em tick.
- IDs de unidades e seeds previsiveis.
- Fila de deploy desacoplada do clique imediato.

## Checklist de execucao

- [x] Criar um relogio de simulacao com acumulador de delta.
- [x] Expor `currentTick`, `tickDurationMs` e `tickDurationSeconds`.
- [x] Trocar `setInterval` do deck por avancos em tick.
- [x] Trocar cooldowns baseados em milissegundos corridos por cooldowns em tick.
- [x] Remover `Date.now()` e `Math.random()` do fluxo autoritativo.
- [x] Mover o deploy para uma fila processada em tick.

## Criterios de aceite

- A mesma sequencia de comandos gera o mesmo resultado no mesmo build.
- O combate nao depende de `performance.now()` para dano, movimento ou spawn.
- O deck nao depende de `setInterval` para mana.
- O build fecha sem erro.

## Validacao minima

- Rodar `npm run build`.
- Validar que as buscas por `performance.now()`, `Date.now()` e `setInterval` nao retornam o nucleo autoritativo.
- Fazer um smoke test manual de spawn, dano e destruicao de torre.

## Riscos conhecidos

- O HUD ainda usa `getDeltaTime()` para animacoes visuais, o que e aceitavel porque nao afeta a verdade da partida.
- Ainda nao existe sessao PvP; o sistema so esta pronto para recebe-la.
