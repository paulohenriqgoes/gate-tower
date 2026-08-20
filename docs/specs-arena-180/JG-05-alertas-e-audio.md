# JG-05 — Alertas de flanco e audio espacial

**Objetivo:** o jogador passa a saber **quantos** inimigos ha no que ele nao esta
vendo — inclusive o que esta dentro do campo de visao mas escondido atras da
torre — sem saber quais nem como estao dispostos.

## Ponto de partida

**O projeto nao tem modulo de audio.** Nao existe `src/audio/`. A fase 03 do
roadmap antigo (sons e musica) nunca comecou, e na v3 ela deixou de ser opcional:
ouvir o que nao se ve **e mecanica**, nao charme.

Existe hoje `src/ui/OffscreenIndicator.ts` (246 linhas, com teste), que aponta
para o que esta fora do quadro. Ele e o candidato natural a ser absorvido — mas
com uma restricao dura de `DR-1`: **ele nunca pode apontar para tras do jogador**.
Tem de saturar na borda do arco. Atravessar as costas custa 0,78 m de deriva
medida, contra 0,075 m dentro do arco.

`src/ui/HudLayer.ts` (400 linhas) precisa encolher para timer + HP da torre +
setas de flanco.

## Arquivos-alvo

`src/ui/FlankAlert.ts` (novo), `src/fx/visibilityRaycast.ts` (novo),
`src/audio/SpatialCues.ts` (novo), `src/ui/HudLayer.ts`,
`src/ui/OffscreenIndicator.ts` (absorvido ou aposentado).

## Contrato

```ts
export function isOccluded(
  scene: Scene, from: Vector3, to: Vector3, blockers: AbstractMesh[]
): boolean;

export class FlankAlert {
  update(threats: SectorThreat[], cameraYawDeg: number): void;
  dispose(): void;
}

/** Hierarquia DJ-4 aplicada por dentro: torradeira > alerta > impacto > tropa. */
export class SpatialCues {
  playEnemySpawn(worldPos: Vector3): void;
  playTeaReady(): void;
  playTowerHit(worldPos: Vector3): void;
  dispose(): void;
}
```

Um setor dispara alerta quando tem inimigo **fora do campo de visao** ou inimigo
**dentro do campo porem ocluido** — raycast de visibilidade contra a torre, nao
comparacao de angulo (spec v3 §2.2).

Sons posicionais usam `Sound` com `spatialSound: true`, e o `AudioEngine` so sobe
**depois da primeira interacao do usuario** (politica de autoplay dos
navegadores). `isOccluded` e reusado pela JG-10.

## Criterio de aceite

Com um inimigo atras do jogador, a seta do lado certo acende com o numero certo;
movendo o inimigo para tras da torre **dentro** do campo de visao, a seta
continua acesa; o som do spawn vem da direcao correta em fone de ouvido; a
torradeira abafa o alerta quando os dois disparam juntos; **nenhum indicador
aponta para fora do arco** (`DR-1`).

## Como validar

`npm test` (raycast e hierarquia sao testaveis com stubs), depois `npm run dev`
no modo tela com camera giravel, e so entao device com fone.

## Fora de escopo

A carta de informacao, que revela especie (JG-09). A torradeira de verdade
(JG-08 emite o evento; aqui so existe o canal de prioridade).

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `FlankAlert` + enxugar `HudLayer` | `general-purpose` | `sonnet` — contrato fechado, e o padrao de HUD ja existe no projeto | `SpatialCues` |
| `visibilityRaycast` + `SpatialCues` com a hierarquia `DJ-4` | `general-purpose` | `sonnet` — implementacao normal; a armadilha (autoplay) ja esta nomeada | `FlankAlert` |

## Depende de

JG-01, JG-04 (consome `getSectorThreats()`).
