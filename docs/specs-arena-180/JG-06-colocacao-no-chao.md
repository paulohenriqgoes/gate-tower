# JG-06 — Colocacao direta no chao

**Objetivo:** invocar tropa vira um gesto so, no lugar onde importa: pressionar a
carta, mirar o chao, soltar. O poder e debitado na colocacao e a tropa nasce onde
foi apontada — sem caminhada a partir do centro.

## Ponto de partida

Hoje a invocacao e em **dois toques**: a metade do jogador acende, um fantasma
aparece por ~200 ms, e toque fora cancela. Isso e o modelo table-scale, e
`DJ-2` o substitui.

`src/interaction/WorldTapRouter.ts` ja e o dono unico do toque e ja roteia por
fase — o padrao de despacho existe e deve ser reusado, nao reinventado.
`ArenaArc.evaluatePlacement()` ja devolve o veredito de "da para colocar aqui",
com `MIN_PLACE_RADIUS_M = 0.9`.

## Arquivos-alvo

`src/interaction/PlacementRing.ts` (novo),
`src/interaction/PlacementRing.test.ts` (novo),
`src/interaction/WorldTapRouter.ts`, `src/combat/CombatEngine.ts`,
`src/cards/CardDeckSystem.ts`.

## Contrato

```ts
export type RingState = "valid" | "too-close" | "out-of-arc" | "too-far" | "no-resource";

export class PlacementRing {
  show(cardId: string): void;      // comeca a seguir o centro da tela projetado no piso
  update(): void;                  // por frame, enquanto visivel
  getCurrentArcPoint(): ArcPoint | null;
  getState(): RingState;
  hide(): void;
}

combatEngine.tryDeployAtArcPoint(p: ArcPoint, cardId: string): boolean;
```

Gesto (`DJ-2`): `pointerdown` na carta chama `show()`; o anel acompanha o centro
da tela enquanto o dedo esta pressionado; `pointerup` — se
`getState() === "valid"`, `tryDeployAtArcPoint` debita e cria a tropa. Qualquer
outro estado cancela **sem gastar nada**.

Fallback de acessibilidade: se o `pointerup` chegar em menos de 150 ms **sem
movimento de mira**, a carta fica selecionada e o segundo toque confirma.

O piso e `y = 0` por construcao (RA-F2), entao projetar o centro da tela no chao
e intersecao com o plano `y = 0` — **nao** e `hitTest`.

## Criterio de aceite

O anel e verde onde da para colocar e apagado onde nao da; soltar num ponto
invalido **nao debita**; a tropa nasce exatamente onde o anel estava e nao caminha
do centro; empilhar na base e impossivel (`MIN_PLACE_RADIUS_M`).

## Como validar

`npm test` — os estados do anel sao logica pura sobre `ArenaArc`. Depois device:
colocar tropa nos tres setores **sem sair do lugar**.

## Fora de escopo

O visual final da carta (JG-07 — aqui a carta ainda e o HUD 2D atual, so para ter
o que pressionar); coleta de cogumelo (JG-08).

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `PlacementRing` + integracao no router e no `CombatEngine` | `general-purpose` | `sonnet` — contrato fechado, e o `WorldTapRouter` ja tem o padrao de despacho por fase | — |

## Depende de

JG-01, JG-04. Roda em paralelo com JG-05 (arquivos disjuntos).
