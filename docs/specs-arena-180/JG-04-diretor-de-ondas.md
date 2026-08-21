# JG-04 — Diretor de ondas e convergencia ao jogador

**Objetivo:** o combate deixa de ser torre-contra-torre com caminho central e
passa a ser ondas que nascem na borda do arco, **sempre fora do que o jogador
esta enquadrando**, e convergem para ele.

## O que a implementacao fixou (2026-08-20)

Cinco coisas que a spec nao dizia e o codigo teve de decidir. Estao aqui porque
sao reversiveis e cada uma tem motivo — nao porque descrevem estado (estado mora
no [quadro](README.md)).

1. **A torre do jogador foi para o vertice do arco**, em `PLAYER_TOWER_RADIUS_M`
   (= `MIN_PLACE_RADIUS_M`, 0,9 m) no azimute 0. Sem isso "convergir
   radialmente para a torre do jogador" nao existe: a torre estava a 2 m ATRAS
   do jogador, e o inimigo teria de atravessar o corpo dele. Nao e zero porque
   uma torre de 1,20 m na origem poe a camera de RA (fixada em 1 m de altura
   pelo engine) dentro do chapeu.
2. **So a torre do jogador entra no combate.** A torre inimiga continua na cena
   como cenario do Beat 5 e foi para **fora** do arco (z = 2,6 m), senao metade
   dos nascimentos do setor central sairia de dentro dela. Ela some na JG-10.
3. **Vitoria = sobreviver aos 3 minutos.** Nao ha mais desempate por HP (nao ha
   segunda torre), e o empate saiu do `MatchResult`. Derrota continua sendo a
   torre cair (`DJ-5`). Enquanto o Coelho nao entra como onda final (`DJ-6`,
   JG-11), este e o unico caminho de vitoria.
4. **Navegacao radial e de duas fases** (`src/battle/radialApproach.ts`): o
   inimigo mantem o azimute ate o anel de fechamento e so entao fecha na torre.
   A primeira versao ia em linha reta ate a torre — e um inimigo nascido em
   `left` a 2,19 m aparecia contado em `center` poucos segundos depois. A seta
   de flanco da JG-05 teria mentido em todo trajeto.
5. **A tropa do jogador tem coleira** (`TROOP_LEASH_RADIUS_M`, 0,8 m do ponto de
   colocacao) e volta para a ancora sem alvo. Sem isso, qualquer colocacao vira
   a mesma colocacao alguns segundos depois, e "onde colocar" — que e o que o
   giro do celular paga — deixa de ser decisao.

Os numeros de 1, 4 e 5 sao tuning: vivem em `src/arena/metrics.ts` e
`src/arena/ArenaArc.ts`, e so mudam por playtest.

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
do jogador — **sem trocar de setor no caminho** — e a danificam;
`getSectorThreats()` devolve a contagem correta por setor; `EnemyScript` e
`DeploymentZone` nao existem mais como arquivo nem como import (os dois nomes
sobrevivem em comentario, no lugar onde um leitor perguntaria por eles — o
`grep` de aceite e por import, ver o bloco "Verificar com" do quadro).

## Como validar

`npm test` e `npm run dev` no **modo tela**. O modo tela e a validacao barata
aqui, porque comportamento de onda nao depende de RA.

O que a suite ja prova **sem Babylon**: o plano de ondas real rodando os 3
minutos inteiros com o jogador girando, sem nascer ninguem em setor enquadrado
nem fora do anel legal (`wavePlan.test.ts`); a contagem por setor
(`sectorThreats.test.ts`); e o trajeto radial nao trocando de setor
(`radialApproach.test.ts`).

O que a suite prova **em `NullEngine`**, headless (`CombatEngine.test.ts`): o
inimigo nasce na borda, atravessa o arco sem sair do flanco, chega na torre, a
danifica e e abatido virando carta; a colocacao recusa dentro do raio minimo e
atras do jogador sem gastar cogumelo; a tropa engaja e nao passa da coleira; e
`reset()` limpa o campo. Foi este teste que pegou a troca de setor no trajeto.

O que **so jogando** se ve, e que falta: a partida inteira lida como jogo — se a
tropa com coleira segura um flanco, se 0,8 m de coleira e pouco ou muito, e se a
torre a 0,9 m do rosto atrapalha em vez de ocluir.

## Fora de escopo

Alertas de flanco (JG-05); o Coelho como onda final (`DJ-6` — entra na JG-11,
depois das ondas comuns validadas); colocacao de tropa do jogador (JG-06).

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| Fiar o `WaveDirector` e reescrever o `CombatEngine` para alvo-unico-jogador com navegacao radial | `general-purpose` | `opus` — modulo central que cruza Arena/Unit/Combat; erro aqui contamina todas as unidades seguintes | — |
| Remover `EnemyScript` e `DeploymentZone` com seus testes | `general-purpose` | `haiku` — mecanico, com os call sites ja listados acima | — (depois da tarefa acima) |

**Como foi de fato (2026-08-20): execucao direta, sem sub-agent.** A remocao dos
dois modulos nao era separavel da reescrita — quem tira a `DeploymentZone` tem de
escrever, no mesmo movimento, a validacao polar que entra no lugar dela. Um
sub-agent frio para a segunda tarefa redescobriria o contrato inteiro para
apagar dois arquivos.

## Depende de

JG-01 (pronta). No quadro, vem depois da Onda C.
