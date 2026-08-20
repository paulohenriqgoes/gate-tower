# RA-F4 — `recenter()` e a colocacao, e o unico jeito de mover a arena

**Objetivo:** ancorar e reposicionar viram o mesmo gesto, e o jogador volta a
escolher **para onde o arco olha**. Nada mais move nada.

## Ponto de partida

A RA-F2 tirou do jogador a escolha de direcao, de proposito e temporariamente. O
codigo diz isso em voz alta:

- `src/types/xr8.d.ts:87` — `recenter` esta **tipado e nunca e chamado**;
- `src/ar/EighthWallARManager.ts:410-431` — `tryCloseArenaAtPlayer()` hoje so
  liga a arena, roda a animacao de spawn e notifica. Nao mede nada, nao pode ser
  recusado, e nao escolhe direcao;
- `:278-283` — o prompt diz "Toque para entrar no mundo" **precisamente porque a
  escolha nao existe entre a RA-F2 e esta unidade**. O texto anterior ("vire para
  onde quer olhar") virou mentira quando o azimute 0 passou a ser o `+Z` fixo do
  mundo;
- `:141-151` — `repositionArena()` e o botao "Reposicionar" de `?debug=1`; ele
  esconde a arena e devolve o contorno, sem mover coisa alguma;
- `:702-706` — recuperar tracking **nao move nada**, e isso e a decisao `DR-3`.

## Arquivos-alvo

`src/ar/EighthWallARManager.ts`, `src/ui/HudLayer.ts`, `src/game/GameFlow.ts`.

## Contrato

```ts
confirmArenaHere(): void   // chama XR8.XrController.recenter()
```

Depois do gesto, o jogador esta no vertice do arco com o azimute 0 na direcao em
que aponta. O **mesmo** metodo serve ao botao de reposicionar durante a partida.
Recuperacao de tracking **avisa e nunca move** (`DR-3`).

Por `DR-3`, o gesto entra como **transicao de fase**: o coaching overlay volta, a
apresentacao da partida pausa ate `trackingStatus === "NORMAL"`, e so entao o
controle e devolvido. `recenter()` descarta o mapa do SLAM — cai para `LIMITED`,
com mais de 30 s para reconvergir. Trata-lo como correcao instantanea no meio da
acao seria mentir sobre o custo.

O prompt de `:283` volta a prometer a escolha de direcao, porque a partir desta
unidade ela existe de novo.

**Onde isto falha em silencio:** a semantica de `facing`. Um `facing` errado nao
lanca erro nenhum — o inimigo simplesmente nasce no flanco errado, e ninguem
percebe ate alguem jogar. Escreva teste para o **sinal** e para o **zero** do
azimute, como a RA-F2 fez em quatro lugares que precisavam concordar.

## Criterio de aceite

A arena nao se desloca em **nenhuma** circunstancia que nao seja o gesto
explicito — nem em `LIMITED -> NORMAL`. Depois do gesto, o flanco de spawn
corresponde ao que o jogador ve.

## Como validar

`npx tsc --noEmit && npm run test`, e device: apontar para uma direcao escolhida,
confirmar, e verificar que a torre inimiga nasce a frente; depois reposicionar
olhando para outra parede e conferir de novo.

## Fora de escopo

**Medicao ou estimativa de deriva — `DR-2` proibe.** Ja foi tentado e falhou em
medicao (media estimada de 0,155 m contra 0,082 m real, correlacao levemente
negativa). Reposicionar e botao, e quem decide e o jogador.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `recenter` como colocacao e reposicionamento | execucao direta | `opus` — a semantica de `facing` falha em silencio: inimigo no flanco errado, sem erro nenhum | — |

## Depende de

RA-F3 (mesmo arquivo, e o `updateRecenterPoint` da F3 e o que faz o gesto
respeitar a altura ajustada).
