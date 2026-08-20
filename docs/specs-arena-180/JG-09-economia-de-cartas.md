# JG-09 — Economia de cartas: derrotado vira carta

**Objetivo:** o game loop passa a ter **entrada** de cartas. Toda criatura abatida
entra no album **no instante do abate** — vale em vitoria e em derrota.

## Ponto de partida

Nao existe nenhuma persistencia de progresso no projeto. `src/cards/cardCatalog.ts`
tem as 4 criaturas jogaveis (Javali 2, Tatu Bola 3, Dona Barata 4, Cururu 5).

O motivo desta unidade existir esta no Ato 4 do storyboard: **a primeira partida
quase certamente termina em derrota**, e o desenho abraca isso. Quem perde sai com
cartas, entendeu o jogo e quer voltar. Quem sai com nada esta perdido.

## Arquivos-alvo

`src/cards/CardAlbum.ts` (+test, novos), `src/cards/CardStock.ts` (+test, novos),
`src/world/PurpleMushroom.ts` (novo), `src/combat/CombatEngine.ts` (so o hook).

## Contrato

```ts
export class CardAlbum {
  register(cardId: string): boolean;      // true = descoberta inedita
  has(cardId: string): boolean;
  entries(): string[];
  toJSON(): string;
  static fromJSON(raw: string): CardAlbum;   // localStorage
}

export class CardStock {
  count(cardId: string): number;
  /** So a criatura que MORRE em batalha e consumida (spec v3 §7). */
  consumeOnDeath(cardId: string): void;
  /** Sobrevivente volta ao estoque no fim da partida. */
  returnSurvivor(cardId: string): void;
  isBankrupt(): boolean;
  grantRandom(rng: () => number): string;   // cogumelo roxo
}
```

**A regra sutil, e a que os testes existem para proteger:** morto e sobrevivente
sao tratados de forma diferente. So quem morre e consumido; quem sobrevive volta
ao estoque no fim da partida.

Falencia (estoque zerado) **nao encerra a partida** (`DJ-5`): faz nascer um
cogumelo roxo que da uma carta aleatoria. E o piso de seguranca.

## Criterio de aceite

Perder a partida e ainda assim sair com as cartas dos inimigos abatidos;
sobreviventes voltam ao estoque e mortos nao; zerar o estoque faz nascer o roxo;
**o album sobrevive ao reload da pagina**.

## Como validar

`npm test` — tudo aqui e logica pura — e uma partida completa em device
**terminando em derrota**, que e o caso que o desenho existe para cobrir.

## Fora de escopo

A tela do album (JG-11); a carta do Coelho, que depende de `DJ-6` e entra na
JG-11 junto com a vitoria.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `CardAlbum` + `CardStock` + testes + persistencia | `general-purpose` | `sonnet` — logica de dupla camada com regra sutil (morto != sobrevivente) | `PurpleMushroom` |
| `PurpleMushroom` como variacao visual do verde | `general-purpose` | `haiku` — variacao de um objeto que ja existira, contrato fechado | `CardAlbum`/`CardStock` |

## Depende de

JG-04. Roda em paralelo com JG-08.
