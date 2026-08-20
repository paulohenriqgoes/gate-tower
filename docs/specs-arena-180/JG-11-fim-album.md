# JG-11 — Fim de partida e album

**Objetivo:** a partida termina, o jogador ve o que conquistou, e volta ao Ato 1.

## Ponto de partida

**Esta unidade encolheu.** A versao original carregava tambem o conserto do ciclo
de vida da sessao de RA (`XR8.run`/`XR8.stop`), e isso **migrou para a RA-F5**,
que roda muito antes no quadro — o bloqueador era caro demais para esperar ate o
fim do plano.

Junto com a tarefa, o contrato antigo dela sai: ele mandava escrever
`startSession()`/`stopSession()` chamando `XR8.run()`/`XR8.stop()`, e **isso esta
errado** — o `xrCameraBehavior` ja chama os dois. Nao o reintroduza.

Ja existe: `src/fx/arenaDissolve.ts` (309 linhas, com teste) — a arena se desfaz
da borda para o centro. `src/arena/ArenaSystem.ts:113` tem um comentario dizendo
que ninguem chama a reconstrucao ainda, e que ela "passa a importar na Etapa 11";
essa "Etapa 11" e **esta** unidade. `src/battle/MatchClock.ts` ja faz a partida de
3 minutos por relogio de parede.

## Arquivos-alvo

`src/ui/AlbumScreen.ts` (novo), `src/fx/arenaDissolve.ts`,
`src/game/GameFlow.ts`, `src/arena/ArenaSystem.ts`.

## Contrato

```ts
export class AlbumScreen {
  show(album: CardAlbum, gained: string[]): void;
  onPlayAgainObservable: Observable<void>;
}
```

Derrota = a torre cair (`DJ-5`). Duracao de 3 min pelo `MatchClock` existente.
O Coelho como onda final (`DJ-6`, **provisoria**) e a carta dele por vitoria
entram aqui.

O album e o **unico momento 2D do jogo**, e os espacos vazios sao o motor de
retorno.

## Criterio de aceite

Tres partidas seguidas no mesmo carregamento de pagina; a arena se desfaz da
borda para o centro antes do album; as cartas ganhadas aparecem destacadas;
"jogar de novo" volta ao Ato 1.

## Como validar

Device, tres partidas seguidas. **E a validacao que destrava testar com pessoas
reais** — e ela so e possivel porque a RA-F5 ja fechou a segunda sessao.

## Fora de escopo

Deck building; qualquer progressao alem do album. O ciclo de vida da sessao de RA
(RA-F5).

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `AlbumScreen` + fim de partida + reconstrucao da arena | `general-purpose` | `sonnet` — tela 2D e fluxo dentro de contrato fechado | — |
| O Coelho como onda final (`DJ-6`) e a carta por vitoria | `general-purpose` | `sonnet` — regra de onda sobre o `WaveDirector` ja fiado | tarefa acima (arquivo disjunto) |

## Depende de

JG-09, JG-10. **Serial**: toca `GameFlow.ts` de novo.
