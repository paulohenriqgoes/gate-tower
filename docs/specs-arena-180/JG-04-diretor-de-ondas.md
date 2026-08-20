# JG-04 — Diretor de ondas e convergencia ao jogador

**Objetivo:** o combate deixa de ser torre-contra-torre com caminho central e
passa a ser ondas que nascem na borda do arco, **sempre fora do que o jogador
esta enquadrando**, e convergem para ele.

## Ponto de partida

**Metade desta unidade ja existe, e ninguem sabia.** `src/battle/WaveDirector.ts`
e `src/battle/WaveDirector.test.ts` estao escritos, testados e **orfaos** —
`grep -rn "WaveDirector" src --include="*.ts"` fora do proprio arquivo sai vazio.
Eles entraram junto com a JG-01 (`96c364e`) e nunca foram fiados.

A API pronta e exatamente a do contrato abaixo, consumindo `ArenaArc`:

```ts
export class WaveDirector {
  constructor(opts: { waves: WaveSpec[]; getCameraYawDeg: () => number; rng?: () => number });
  update(elapsedMs: number): SpawnOrder[];
  reset(): void;
}
```

**O caminho antigo continua vivo**, e e ele que precisa morrer:

- `src/battle/EnemyScript.ts` — usado em `main.ts:11` e
  `GameFlow.ts:10,136,180,483` (`EnemyScriptRunner`);
- `src/combat/DeploymentZone.ts` — usado em `main.ts:16,402` e
  `CombatEngine.ts:14,67,119`.

O insumo de "para onde o jogador olha" ja existe e ja esta correto:
`EighthWallARManager.getCameraYawDeg()` (`:164`), que devolve o heading direto
porque a arena esta na origem sem rotacao.

## Arquivos-alvo

`src/combat/CombatEngine.ts` (reescrito), `src/units/BaseUnit.ts`,
`src/game/GameFlow.ts`, `src/main.ts`.
**Remocoes:** `src/battle/EnemyScript.ts` (+test),
`src/combat/DeploymentZone.ts` (+test).

## Contrato

O que falta escrever:

```ts
export interface SectorThreat { sector: SectorId; count: number; nearestRadiusM: number; }
combatEngine.getSectorThreats(): SectorThreat[];
combatEngine.onEnemyDefeatedObservable: Observable<{ cardId: string }>;
combatEngine.onPlayerTowerDamagedObservable: Observable<Vector3>;  // ja existe, permanece
```

`getSectorThreats()` e declarado **aqui** e consumido pela JG-05 — e o que permite
as duas serem planejadas sem se atropelar.

As unidades inimigas passam a convergir **radialmente** para a torre do jogador,
em vez de seguir o caminho central. `tryDeployAtWorldPoint` (`CombatEngine:231`)
sobrevive como esta ate a JG-06 troca-lo pelo anel.

## Criterio de aceite

Nenhum inimigo nasce em setor enquadrado enquanto houver setor livre; nenhum
nasce dentro de `MIN_PLACE_RADIUS_M`; inimigos convergem radialmente para a torre
do jogador e a danificam; `getSectorThreats()` devolve a contagem correta por
setor; `grep -rn "EnemyScript\|DeploymentZone" src/` sai vazio.

## Como validar

`npm test` e `npm run dev` no **modo tela**. O modo tela e a validacao barata
aqui, porque comportamento de onda nao depende de RA — e com a RA-F5 ainda
recente, poupar entradas em device tem valor.

## Fora de escopo

Alertas de flanco (JG-05); o Coelho como onda final (`DJ-6` — entra na JG-11,
depois das ondas comuns validadas); colocacao de tropa do jogador (JG-06).

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| Fiar o `WaveDirector` e reescrever o `CombatEngine` para alvo-unico-jogador com navegacao radial | `general-purpose` | `opus` — modulo central que cruza Arena/Unit/Combat; erro aqui contamina todas as unidades seguintes | — |
| Remover `EnemyScript` e `DeploymentZone` com seus testes | `general-purpose` | `haiku` — mecanico, com os call sites ja listados acima | — (depois da tarefa acima) |

## Depende de

JG-01 (pronta). No quadro, vem depois da Onda C.
