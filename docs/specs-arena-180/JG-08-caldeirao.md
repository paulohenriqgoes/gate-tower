# JG-08 — Caldeirao fermentador

**Objetivo:** existe um lugar no mundo onde o poder se regenera, com leitura por
volume de liquido, aceleracao por cogumelo verde, aviso sonoro de pronto, e uma
janela de vulnerabilidade que o jogador escolhe quando pagar.

## Ponto de partida

Nao existe `src/world/`. `src/cards/CardDeckSystem.ts` (239 linhas) ja gerencia
"cogumelos" como recurso, e e ele que vira "poder".

`CAULDRON_HEIGHT_M = 0.5` ja esta em `src/arena/metrics.ts` — a constante entrou
com a JG-02, o objeto nao.

## Arquivos-alvo

`src/world/Cauldron.ts` (novo), `src/world/Cauldron.test.ts` (novo),
`src/world/GreenMushroom.ts` (novo), `src/cards/CardDeckSystem.ts`,
`src/audio/SpatialCues.ts`.

## Contrato

```ts
export class Cauldron {
  getFillRatio(): number;   // 0..1 — o volume de liquido E a UI
  addMushroom(): void;      // cogumelo verde entregue: acelera a fermentacao
  isReady(): boolean;
  drink(): boolean;         // restaura o poder ao maximo. Sem duracao, sem buff
  onReadyObservable: Observable<void>;   // dispara a torradeira (DJ-4)
}

// CardDeckSystem: "cogumelos" viram "poder", com regeneracao LENTA de fundo
deck.getPower(): number;
deck.setPower(value: number): void;
deck.canPay(cardId: string): boolean;
```

Beber (`DJ-3`) = tocar no caldeirao **enquanto ele esta enquadrado**. A exposicao
e o proprio enquadramento — nao existe timer.

O cogumelo verde nasce **atras dos inimigos** (spec v3 §8); `ArenaArc` ja sabe
onde isso e. Tocar nele faz o cogumelo voar sozinho ate o caldeirao.

## Criterio de aceite

Cogumelo tocado voa e sobe o nivel do liquido; ao encher, toca a torradeira e o
liquido muda de leitura; beber acende todas as cartas pagaveis.

**E o criterio que testa o desenho, nao o codigo:** a telemetria confirma que
durante o gesto de beber `framedSectors()` esta **vazio**. Se nao estiver, a
janela de vulnerabilidade nao existe e o desenho falhou — nao o codigo.

## Como validar

`npm test` (fermentacao e poder sao logica pura) e device.

## Fora de escopo

O cogumelo roxo (JG-09). O tuning do cogumelo verde: as constantes entram
nomeadas em `metrics.ts` para serem trocadas sem refatorar, e o valor certo so
sai de playtest (ver `decisoes.md`).

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `Cauldron` + testes de fermentacao | `general-purpose` | `sonnet` — regra nova com trade-off de tuning | `GreenMushroom` |
| `GreenMushroom` (spawn atras do inimigo, voo ate o caldeirao) | `general-purpose` | `sonnet` — implementacao normal sobre `ArenaArc` | `Cauldron` |
| Renomear cogumelo para poder no `CardDeckSystem` e afrouxar a regeneracao de fundo | `general-purpose` | `haiku` — renomeacao e ajuste de constante, verificavel pelo build e pela suite | as duas acima (arquivo disjunto) |

## Depende de

JG-07. Roda em paralelo com JG-09.
