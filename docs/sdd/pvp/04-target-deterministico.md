# SDD 04 - Target deterministico

## Status

- Estado no repositorio: pendente.

## Objetivo

Adicionar perfis de alvo por carta e garantir que a selecao de target seja 100% deterministica entre clientes.

## Problema que esta fase resolve

- Nem toda carta deve focar torre.
- O sistema atual escolhe alvos com regras simples demais para PvP futuro.
- Empates precisam ter desempate estavel ou o combate diverge.

## Escopo

- Permitir perfis `[torre]`, `[tropa]` e `[tropa, torre]`.
- Ensinar unidades a procurar inimigos validos pelo perfil.
- Definir desempates estaveis quando distancias forem equivalentes.

## Regras minimas

- Quando a carta aceitar mais de um tipo de alvo, usar o inimigo valido mais proximo.
- `Cururu Bombado` continua com foco em torre.
- Unidades de enxame ou contato podem focar tropa antes de torre.
- Empates precisam usar ordem estavel, por exemplo: distancia, tick de spawn, ID da unidade.

## Sugestao de modulos

- `src/battle/TargetTypes.ts`
- `src/combat/TargetResolver.ts`
- `src/cards/CardCatalog.ts`
- `src/units/UnitDefinition.ts`

## Checklist de execucao

- [ ] Criar tipagem de perfil de alvo.
- [ ] Tirar regra de target hardcoded de cada unidade.
- [ ] Centralizar resolucao de alvo em um resolver deterministico.
- [ ] Adicionar desempates estaveis.
- [ ] Atualizar o catalogo das cartas atuais.

## Criterios de aceite

- Cada carta possui perfil de alvo explicito.
- A ordem de target e identica nos dois clientes para o mesmo estado.
- `Cururu Bombado` continua focando torre.
- O build fecha sem erro.

## Validacao minima

- Montar cenario com tropa e torre validas ao mesmo tempo.
- Validar a mesma escolha em duas execucoes identicas.

## Fora de escopo

- Balanceamento fino das cartas.
- Novas cartas que nao existam no roster atual.
