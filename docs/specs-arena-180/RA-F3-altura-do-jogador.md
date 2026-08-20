# RA-F3 — A altura do jogador e `origin.y`

**Objetivo:** o jogador ajusta a propria altura e ve a arena subir e descer
contra o piso real, com a sessao no ar.

**Por que e obrigatoria, e nao conveniencia:** a origem e capturada no `onAttach`,
quando o celular esta na pose de *apertar um botao* — nao na de jogar. Medido em
device: `delta` de -0,49 a -0,92 m numa sessao em que o jogador entrou com a mao
levantada. Sem recalibracao pos-attach, **todo o resto da sessao herda esse
offset**, e o piso declarado deixa de cair onde deveria.

## Ponto de partida

O piso declarado ja funciona e ja foi confirmado em device: com 1,55 m declarado
a arena assentou no chao real, com melhor calibracao em `delta 0.00`. O que falta
e torna-lo ajustavel.

- `src/ar/EighthWallARManager.ts:35` — `DEFAULT_PLAYER_HEIGHT_M = 1.55`,
  constante, com o comentario explicando que torna-la ajustavel e esta unidade;
- `:109` — o campo `playerHeightM`, escrito uma vez e nunca mais;
- `:548-552` — a `arCamera` nasce em `new Vector3(0, this.playerHeightM, 0)`, e a
  posicao ANTES do attach e o que o modulo Babylon le;
- `:636-658` — `applyDeclaredOrigin()` chama
  `updateCameraProjectionMatrix({ origin, facing })`, e **ja tem a blindagem
  contra valor nao-finito**, que precisa sobreviver a esta unidade;
- `:680-682` — quem a chama e o `onStart` do modulo de status.

`grep -rn "setPlayerHeight" src/` sai vazio.

## Arquivos-alvo

`src/ar/EighthWallARManager.ts`, `src/ui/StartScreen.ts`.

## Contrato

```ts
setPlayerHeight(m: number): void
```

Reaplica
`updateCameraProjectionMatrix({ origin: { x: 0, y: m, z: 0 }, updateRecenterPoint: true })`
**com a sessao no ar**. Faixa de 1,30 a 2,05 m, passo de 5 cm, default 1,55,
persistido em `localStorage`.

**`updateRecenterPoint: true` nao e detalhe:** ele faz o ponto de `recenter()`
acompanhar a nova origem, e a RA-F4 depende disso para o gesto de colocacao nao
desfazer o ajuste de altura.

**NUNCA envie valor nao-finito.** `origin` com NaN contamina o frame do engine de
forma **permanente** — nao existe caminho de volta sem reiniciar a sessao. A
guarda de `applyDeclaredOrigin()` cobre o caminho de hoje; o setter novo precisa
da mesma guarda, antes de gravar o campo.

## Criterio de aceite

Mover o controle desloca a arena verticalmente **em tempo real**, sem reiniciar a
sessao. Em device, o `delta` de calibracao chega a 0,00. Valor invalido nunca
alcanca o engine.

## Como validar

`npx tsc --noEmit && npm run test`, e device com `?debug=1`: mover o controle e
ver a arena subir e descer contra o piso real, com o campo `originY` do overlay
de diagnostico acompanhando.

## Fora de escopo

`recenter` (RA-F4). Medir a altura por sensor — a decisao do projeto e que o piso
e **declarado**, e voltar a medi-lo e reabrir um caminho que a RA-F2 fechou com
evidencia.

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `setPlayerHeight` + reaplicacao da origem | `general-purpose` | `sonnet` — dentro do contrato que a RA-F2 ja fixou | controle de UI |
| Controle de altura na tela inicial | `general-purpose` | `sonnet` — segue o padrao de HUD existente | tarefa acima |

## Depende de

RA-F5 (ordem do quadro — sem segunda sessao, validar isto custa um reload por
tentativa). Escreve o mesmo arquivo que RA-F4, entao as duas sao seriais entre si.
