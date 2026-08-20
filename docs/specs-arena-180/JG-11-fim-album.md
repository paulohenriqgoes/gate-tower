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

## O BUG DO REPLAY, visto em device em 2026-08-20 — conserte aqui

Esta unidade e a dona do "volta ao Ato 1", entao o defeito abaixo e dela. Ele foi
observado com evidencia (video + telemetria) e **nao foi consertado na sessao em
que apareceu**, de proposito: a decisao do dono do projeto foi que a JG-07 e esta
unidade vao reescrever boa parte do `GameFlow` e do HUD, e consertar antes seria
consertar codigo que vai sair.

**O sintoma:** na terceira partida seguida o jogo "nao reseta" e fica injogavel.

**O que a evidencia mostra, e o que ela NAO mostra.** Depois que a segunda
partida terminou, **nenhum evento que nasce no `GameFlow` ou no `CombatEngine`
voltou a ser registrado** — sem `enemy_awakened`, sem `card_deployed`, sem
`match_ended` — numa telemetria que continuou gravando por mais 125 s. No mesmo
intervalo o `arena_placed`, que nasce no AR Manager, registrou normalmente duas
vezes. E o video mostra uma terceira partida inteira acontecendo: relogio 2:58 ->
2:31, torre inimiga de 1000 para 123, o HUD congelando como `match-over` congela,
e o menu aparecendo depois.

Ou seja: **o lado da RA continuou fiado e o lado do jogo emudeceu**, com o render
loop rodando (o `cameraYawDeg` do painel seguia mudando).

**A pista mais forte, e ela nao fecha sozinha.** O conjunto de observaveis que
emudeceu e EXATAMENTE o que `GameFlow.dispose()` e `CombatEngine.dispose()`
limpam com `Observable.clear()` (`GameFlow.ts:296-298`,
`CombatEngine.ts:316-320`). So que os dois so sao chamados pelo
`scene.onDisposeObservable`, que tambem descartaria o HUD, a tela inicial e o
painel de `?debug=1` — e os tres continuaram desenhando. Entao "a cena foi
descartada" **nao explica**. Nao invente o mecanismo: instrumente.

**Descartado por resposta do usuario:** nao houve mensagem de erro na tela
inicial (logo nao foi o caminho `handleSessionFailed`), e nao houve erro no
console.

**Contribuiu, mas nao e a causa:** o "Reposicionar" de `?debug=1` foi usado uma
vez na terceira partida. Ele devolve a sessao ao setup e o toque seguinte passa
por `confirmArenaHere()`, que dispara `onArenaClosedObservable` — mas
`handleArenaClosed()` so age quando a fase e `ar-setup`, entao fora dela o gesto
recoloca a arena e **a maquina de estado nao acompanha**. Isso explica a
colocacao extra na telemetria, nao o emudecimento.

**O que fazer aqui:** ao reescrever o ciclo de partida, garanta que
(1) uma observavel de `GameFlow`/`CombatEngine` nunca perca observadores enquanto
o objeto continua vivo, e (2) recolocar a arena com a partida em andamento seja
uma transicao de fase explicita, e nao um evento que a fase corrente ignora.

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
