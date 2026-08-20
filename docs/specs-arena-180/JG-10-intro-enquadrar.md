# JG-10 — A intro: o gatilho e enquadrar

**Objetivo:** o Ato 1 e o Ato 2 do storyboard existem. A torre brota, o som de
banho chama, o jogador procura com o celular, e **enquadrar** o Coelho por 1–2 s
continuos abre a fenda e fecha a arena.

E a primeira acao da partida **e e exatamente a mecanica central do jogo**. Nao
ha texto de tutorial.

## Ponto de partida

O gatilho hoje e **aproximacao**, nao enquadramento: `src/towers/ProximityTrigger.ts`
(246 linhas, com teste) dispara quando o jogador chega a ~45 cm da caverna e
sustenta por 0,8 s. Isso e o modelo table-scale, e a v3 o substitui — ela proibe
deslocamento.

`src/game/GameTypes.ts:24` — `GamePhase` tem **5 fases** hoje
(`menu | ar-setup | world-alive | playing | match-over`); esta unidade pede **7**.

Ja existem e sao reusados: `src/towers/CrazyRabbit.ts` (o Coelho que salta da
caverna e fica morando ao lado da torre, respirando),
`src/units/idle/ResidentPopulation.ts` (o mundo vivo do Ato 1), e
`isOccluded` da JG-05.

## Arquivos-alvo

`src/towers/FramingTrigger.ts` (+test, novos),
`src/towers/ProximityTrigger.ts` (+test, removidos),
`src/fx/FloorCrack.ts` (novo), `src/towers/CrazyRabbit.ts`,
`src/game/GameFlow.ts`, `src/game/GameTypes.ts`.

## Contrato

```ts
export type GamePhase =
  | "menu" | "ar-setup" | "world-alive" | "arena-closing"
  | "playing" | "match-over" | "album";

export type FramingStage = "idle" | "noticing" | "staring" | "triggered";

export class FramingTrigger {
  /** `isFramed` = dentro do cone central E nao ocluido (reusa `isOccluded`). */
  update(isFramed: boolean, nowMs: number): FramingStage;
  getStage(): FramingStage;
  reset(): void;
}
```

`isFramed` exige **tres coisas juntas**, e as tres importam: o Coelho dentro do
frustum, dentro de um cone central de ~20 graus (ter no canto do olho **nao e**
enquadrar), e nao ocluido.

Os limiares saem de **telemetria de device**, nao de palpite — e o mesmo criterio
que o `ProximityTrigger` usou para chegar aos 45 cm e 0,8 s.

A reacao e **gradual antes da explosao**: para de cantar, olha de lado, encara.
Dois segundos de silencio antes de qualquer coisa acontecer. E o que o storyboard
chama de momento de captura — o clipe que as pessoas gravam.

## Criterio de aceite

Varrer a camera passando de raspao pelo Coelho **nao** dispara; manter no centro
por ~1,5 s dispara; a reacao e gradual e legivel antes de qualquer coisa
acontecer; a fenda abre no piso real e a arena fecha na posicao do jogador.

## Como validar

`npm test` (a maquina de estados e pura) e device, com a telemetria registrando o
intervalo `arena_placed -> framing_triggered`.

**Precisa de alguem que nao conhece o jogo.** O autor testando o proprio jogo nao
vale como leitura desta metrica, e o projeto ja registra esse erro duas vezes.

## Fora de escopo

O fim de partida (JG-11). A placa "CUIDADO" (`src/towers/CautionSign.ts`)
continua so como cenario e nao e gatilho de nada.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| O gatilho de enquadramento, a reacao gradual e a nova maquina de fases | `general-purpose` | `opus` — e o "momento Alice": decisao de sensacao que cruza RA, animacao e fluxo, e cujo erro so aparece com gente testando | — |
| `FloorCrack` (a fenda) | `general-purpose` | `sonnet` — efeito localizado, contrato fechado, arquivo disjunto | tarefa acima |

## Depende de

JG-02, JG-05 (usa `isOccluded`), e a fundacao de RA fechada. **Serial**: reescreve
`GamePhase`, e nada pode estar mexendo em `GameFlow.ts` junto.
