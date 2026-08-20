# 07 — Calibracao manual do piso (Onda 3 da v3)

> **OBSOLETA (2026-08-19). Nao execute esta spec.** Ela tenta consertar a medicao
> de piso por `hitTest`. A [spec 08](08-fundacao-ar.md) **remove** a medicao de
> piso: o chao passa a ser declarado por `origin.y` em
> `XR8.XrController.updateCameraProjectionMatrix`, como faz o codigo oficial do
> 8th Wall — e isso **ja foi implementado e confirmado em device** (`066a5d7`).
> Esta spec nunca chegou a comecar. Fica no repo como historico da abordagem
> descartada.
>
> A spec 08 tambem foi migrada: o trabalho vivo de RA esta em
> [`docs/specs-arena-180/`](../specs-arena-180/README.md).

**Status:** escrito em 2026-08-19, **nao executado**. Nenhuma etapa abaixo comecou.

Spec auto-contido: da para executar sem ler a investigacao que o originou. O
contexto completo esta em
[`docs/experimentos/arena-180-atencao.md`](../experimentos/arena-180-atencao.md),
entrada de 2026-08-19.

## O problema, em numeros

A arena da v3 nasce em volta do jogador, e a altura do piso vem de um fit de
plano sobre ~12 `hitTest` do SLAM numa faixa da metade inferior da tela. A
sessao de device de 2026-08-19 mediu essa nuvem de pontos, e ela **nao e um
plano**:

| grandeza | min | p25 | mediana | p75 | max |
| --- | --- | --- | --- | --- | --- |
| `tiltDeg` do fit | 0,0 | 7,6 | **13,3** | 24,5 | **47,7** |
| `spreadM` dos inliers | 0,00 | 0,20 | **0,32 m** | 0,58 | **2,82 m** |
| `inliers` (de 12) | 8 | 9 | 11 | 12 | 12 |

Um piso medido decentemente teria dispersao de 2 a 5 cm. Com 32 cm de dispersao
e 11 dos 12 pontos sobrevivendo a rejeicao de outlier, a mediana cai no meio de
uma mistura de chao, movel e ponto solto no ar.

Consequencia medida: **12 toques recusados em sequencia**, todos por
`bad-height`, com altura de device de 0,41 m e 0,65 m — o jogador estava de pe.
O jogo ficou intocavel, e a reancoragem pos-relocalizacao tambem nao rodou
nenhuma vez, porque morre no mesmo gate.

## A decisao

**Parar de adivinhar o chao e deixar o jogador marca-lo.** O jogador tem, a
1,4 m do chao, oclusao, perspectiva e sombra real como referencia; o SLAM tem 12
pontos ruidosos. A altura do piso e 1 grau de liberdade e uma pessoa resolve
isso em tres segundos.

Duas coisas que essa decisao **nao** faz, e que nao devem ser prometidas em
lugar nenhum:

1. **nao cura o drift sob tracking `NORMAL`.** A mesma sessao registrou a arena
   se afastando de 1,09 m para 2,9 m durante um giro de 360 graus com o jogador
   parado, ainda com o SLAM reportando `NORMAL`. Isso e assunto da Onda 4;
2. **nao elimina a dependencia do SLAM.** A pose continua vindo dele. O que sai
   e so a pergunta que ele responde mal.

`FEATURE_POINT` **continua** na lista de tipos aceitos. Removelo ja foi tentado
neste projeto e deixou o `hitTest` mudo — nada ficava verde. A decisao esta
registrada no diario; nao reverta sem dado novo.

## Etapa 6 — `floorCalibration.ts`

**Arquivos gravaveis:** `src/ar/floorCalibration.ts`, `src/ar/floorCalibration.test.ts` (os dois novos).

**Contrato:**

```ts
export const MIN_FLOOR_HEIGHT_M = 0.8;      // mesma faixa que o gate antigo usava
export const MAX_FLOOR_HEIGHT_M = 2.0;
export const FALLBACK_HEIGHT_M = 1.4;       // sem palpite do fit, comeca aqui
export const DRAG_METERS_PER_PX = 0.0018;   // ~1,2 m ao varrer a tela inteira

export class FloorCalibration {
  constructor(initialHeightM?: number | null);   // null = FALLBACK_HEIGHT_M
  /** Arrasto vertical em px CSS. Positivo = dedo para BAIXO. Devolve a altura vigente. */
  dragBy(deltaPx: number): number;
  lock(): void;
  reset(initialHeightM?: number | null): void;
  get heightM(): number;
  get isLocked(): boolean;
}
```

**O sinal do arrasto, com a derivacao.** Errar isso no escuro e facil e so
aparece em device, entao a razao fica escrita: o arco e centrado no jogador, e o
trecho visivel dele esta a ~0,9 m a frente — **distancia horizontal fixa**.
Baixar o piso aumenta so a queda vertical, entao o angulo abaixo do eixo da
camera cresce e o arco **desce na tela**. Logo: dedo para baixo = piso mais
baixo = arco acompanha o dedo. Se em device a sensacao for invertida, o conserto
e trocar o sinal desta constante nomeada, e nada mais.

**Criterio de aceite (testes):** clamp nos dois extremos; arrasto acumula entre
chamadas; `lock()` congela (arrasto posterior nao move); `reset(null)` cai no
fallback; a sensibilidade nao depende de onde o arrasto comecou.

**Fora de escopo:** nao importa Babylon, nao conhece cena, nao dispara hitTest.

**Sub-agent:** `general-purpose`, modelo `sonnet` — contrato fechado, logica pura.

## Etapa 7 — arrasto no `WorldTapRouter`

**Arquivos gravaveis:** `src/interaction/WorldTapRouter.ts`, `src/interaction/WorldTapRouter.test.ts`.

Hoje o router escuta **apenas `POINTERDOWN`**. Arrasto precisa de `POINTERMOVE` e
`POINTERUP`, e precisa entrar por ele: esta classe existe porque havia dois
assinantes de `scene.onPointerObservable` disputando o mesmo evento, e assinar o
ponteiro por fora recria esse bug.

**Contrato:**

```ts
setDragHandler(phase: GamePhase, handler: {
  onDown?: () => void;
  onMove?: (deltaYPx: number) => void;   // delta em px CSS desde o ultimo move
  onUp?: () => void;
} | null): void;
```

Mapa **separado** do de toque: `WorldTapHandler` nao muda de assinatura, entao
`CombatEngine` e as demais fases nao sao tocadas.

**Criterio de aceite:** `POINTERMOVE` sem `POINTERDOWN` nao chama nada; o delta
acumula corretamente ao longo de varios moves; troca de fase no meio do arrasto
cancela o arrasto; fase sem drag handler se comporta exatamente como hoje.

**Gotcha obrigatorio:** o delta sai de `clientY` (**px CSS**), nunca de px de
dispositivo. E o mesmo erro que `normalizeToCanvas` documenta em
`src/ar/hitTestSampling.ts` e que ja custou uma sessao de device.

**Sub-agent:** `general-purpose`, modelo `sonnet` — contrato fechado, mas mexe no
dono unico do input, onde erro vira toque fantasma.

## Etapa 8 — fiacao, e a poda

**Arquivos gravaveis:** `src/ar/EighthWallARManager.ts`, `src/ar/placementGate.ts`
(+ teste), `src/ar/ArenaGhost.ts`, `src/ar/floorEstimate.ts` (+ teste),
`src/ar/ArSessionController.ts`, `src/telemetry/SessionTelemetry.ts`, `src/main.ts`.

**Fluxo novo:** tracking chega em `NORMAL` -> o arco aparece na altura do palpite
-> o jogador arrasta ate ele encostar no chao -> um toque trava a altura **e**
fecha a arena no mesmo gesto.

**Entra:**

- `floorY` vem de `FloorCalibration`, nunca mais de medicao continua;
- a reancoragem pos-relocalizacao passa a usar `origin = (cam.x, cam.y −
  alturaTravada, cam.z)`, **sem nenhum hitTest**. A altura de uma pessoa nao muda
  quando o SLAM relocaliza, e foi por remedir que ela morreu no gate em
  2026-08-19. Fica mais barata e mais robusta ao mesmo tempo;
- um estado de preview novo para "ajustando altura".

**Sai:**

- `bad-height` e `searching` do `placementGate`. Sobram `waiting-tracking` e o
  estado de ajuste. **O gate nao pode mais ter nenhum caminho que recuse por
  altura** — esse e o criterio de aceite mais importante desta etapa;
- a classe `FloorTracker` inteira (`floorEstimate.ts`) e os testes dela. Ela
  nasceu em 2026-08-19 para estabilizar uma medicao continua que deixa de
  existir. Deixar uma classe sem chamador no repositorio e a semente do proximo
  engano.

**Fica, rebaixado:** `measureFloor` vira **palpite inicial** e fonte do evento
`floor_fit_sample`, agora amostrado a **1 Hz e apenas durante o ajuste** (hoje
sao 12 hitTests a 5 Hz o tempo inteiro, ou seja 60 por segundo num aparelho que
ja esta rodando SLAM). O evento continua existindo mesmo sem decidir nada,
porque e ele que vai responder com numero se este device devolve
`DETECTED_SURFACE` ou so `FEATURE_POINT` — pergunta que hoje so tem resposta de
memoria. Para isso, `floor_fit_sample` ganha `pointsTotal` e a contagem por tipo
de hitTest.

**Criterio de aceite:** `npx tsc --noEmit`, `npx vitest run` e `npm run build`
verdes; nenhum caminho de recusa por altura sobrando no gate.

**Sub-agent:** execucao direta (sem sub-agent), modelo `opus` — cruza cinco
modulos e apaga um gate inteiro.

## Etapa 9 — validacao em device (serial, do usuario)

`?debug=1`, de pe: ancorar, ficar parado 30 s, girar 360 graus, exportar o JSON.

Perguntas que esta rodada responde:

1. o arco encosta no chao e **fica** la?
2. o gesto de arrastar e obvio sem instrucao nenhuma na tela?
3. o sinal do arrasto esta certo (o arco acompanha o dedo)?
4. **quanto a arena anda no giro de 360 graus** — este numero e a linha de base
   contra a qual a Onda 4 vai ser medida;
5. o `floor_fit_sample` diz que este device devolve superficie, ou so feature
   point?

## Ondas

```
Onda 3: Etapa 6 · Etapa 7   (paralelo — arquivos disjuntos)
        -> Etapa 8          (serial, unica que toca EighthWallARManager.ts)
        -> Etapa 9          (device, serial por natureza)
```

## Onda 4 — fora de escopo desta spec

Decidido em 2026-08-19 fatiar, para cada ida ao device responder uma pergunta
limpa: a pergunta da varredura ("mapear o arco antes reduz o drift do giro?") so
e mensuravel depois que ancorar voltar a funcionar.

Fica para a Onda 4, na ideia original do usuario:

- **raio ajustavel** pelo jogador (a spec v3 ja preve 2,0 a 2,5 m), para o arco
  caber no espaco real da sala;
- **varredura dos flancos**: girar para a direita e para a esquerda marca os
  limites do arco. O ganho maior nao e o angulo — e que **a calibracao obriga o
  SLAM a mapear exatamente as direcoes que o jogo vai usar**, antes da partida.
  O deslocamento de 1,8 m medido em 2026-08-19 aconteceu porque o giro foi para
  regioes que o SLAM nunca tinha visto;
- **fronteira viva**: olhar alem do arco calibrado pulsa a borda da tela. Converte
  o residuo de drift em regra de jogo legivel, em vez de bug invisivel.

**Restricao de projeto para a varredura:** o arco precisa continuar **simetrico**.
`ArenaArc` assume `half = arcDeg / 2` em torno do azimute 0, e `sectorRangeDeg` e
`framedSectors` derivam disso. Com direita e esquerda diferentes, use
`arco = 2 x min(direita, esquerda)` e mantenha **uma** constante — que e o que a
decisao D7 do plano da v3 ja previa. Arco assimetrico exigiria generalizar os
tres.
