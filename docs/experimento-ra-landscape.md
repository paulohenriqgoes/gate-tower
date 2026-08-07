# Experimento: arena estavel em RA e layout paisagem

Diario do experimento que atravessou as branches `paulo/8th-wall` e
`paulo/landscape-layout`. Registra **o que foi tentado, o que cada tentativa
provou e o que ainda esta aberto** — inclusive as conclusoes que foram
desmentidas depois. Ultima atualizacao: **2026-08-06**.

## Objetivo

Um jogo de cartas com lanes, jogado com o celular deitado (landscape-first), com
a arena ancorada no chao real via SLAM do 8th Wall — rodando no navegador, sem
app, em iOS e Android.

Duas exigencias que puxam em direcoes diferentes:

- o **HUD** quer paisagem (lanes largas, cartas na borda direita);
- o **tracking** e sensivel a tudo que mexe em orientacao, viewport e projecao.

O experimento e sobre encontrar o ponto onde as duas coisas convivem.

## Linha do tempo

### `abac587` — o deslize da arena (2026-08-03)

**Feito:** posicionamento da arena deixou de usar raycast contra o plano
matematico `y = 0` e passou a usar `XR8.XrController.hitTest` na superficie real.
No toque, um grid de amostras (`src/ar/hitTestSampling.ts`: `buildSampleOffsets`,
`fitGroundPlane`) estima altura mediana com rejeicao de outlier e normal por
minimos quadrados; a arena e posicionada na profundidade real e **travada**
(place-once, sem reancoragem continua — reancorar introduzia tremor). Somado a
isso: grid xadrez escondido em RA, sombra de contato (`src/fx/contactShadow.ts`)
e animacao de entrada por escala (`src/fx/spawnAnimation.ts`).

**Provou:** existem **dois** deslizes diferentes e a cura e diferente para cada
um. O que some com place-once e o *escorregar por profundidade errada* (so
aparece quando a camera anda). O que sobra e o *salto de relocalizacao* do SLAM
(acontece com o celular parado, em degrau) — esse nao tem cura no binario
distribuido, que nao expoe anchor por objeto, so `recenter()`.

### `ed93779` — layout paisagem (2026-08-05)

**Feito:** HUD reconstruido landscape-first, enquadramento de camera por aspect
ratio (`src/camera/arenaFraming.ts`), `manifest.webmanifest` para tela cheia no
iOS via "Adicionar a Tela de Inicio", e entrada em tela cheia + trava de
orientacao (`requestFullscreen` + `screen.orientation.lock`) no primeiro gesto —
como **politica global**, valendo tambem para a RA.

**Resultado em device:** o HUD e a tela cheia ficaram bons. A RA, com o lock de
paisagem ativo, ficou inutilizavel: os objetos deslizavam a qualquer movimento.
Em portrait o mesmo codigo funcionava.

**Nao resolveu:** (a) entrar em tela cheia e travar **antes** de subir a sessao,
esperando a viewport estabilizar; (b) suprimir qualquer pedido de
fullscreen/lock com a sessao no ar; (c) trocar o lock generico `"landscape"` por
`"landscape-primary"`.

**Cuidado ao ler esta etapa:** a conclusao registrada na epoca foi "RA nao
funciona em paisagem". Ela envelheceu mal — ver `49a8b44` abaixo. Naquele
momento **nao existia gate de calibracao**: a escala absoluta ainda nao tinha
convergido quando a arena era ancorada, entao o conteudo deslizaria de qualquer
jeito, em qualquer orientacao. O experimento estava medindo duas coisas ao mesmo
tempo e creditando o resultado a uma so.

### `d3354a9` — o que o bundle do engine realmente faz (2026-08-05)

**Feito:** engenharia reversa do bundle do `@8thwall/engine-binary` para parar de
supor como o engine consome orientacao. Achados registrados na skill
(`.claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md`):

- `orientation` e recalculado **a cada frame** (`screen.orientation.angle`, sem
  cache) e entregue ao WASM no `stageFrame`, junto com o IMU cru;
- o IMU vai **sem nenhuma compensacao** pelo angulo de tela — a compensacao e do
  WASM, usando o argumento `orientation`;
- dos tres canais que atualizam o estado do WASM, `onCanvasSizeChange` e o unico
  que **nao** carrega `orientation`;
- a projecao de RA nao usa `camera.fov`/`aspectRatio` do Babylon: a matriz e
  injetada por frame a partir das intrinsics do WASM, via
  `camera.freezeProjectionMatrix`.

**Provou:** o problema **nao** era o app deixar a orientacao passar batido. Isso
matou a hipotese "calibrar em portrait e depois girar" — nao existe estado
"calibrado numa orientacao", a leitura e continua. E deixou o `pixelRect` das
intrinsics como o suspeito restante.

### `49a8b44` — coaching overlay e calibracao obrigatoria (2026-08-06)

**Feito:**

- `@8thwall/coaching-overlay` (MIT) integrado por
  `src/ar/coachingOverlay.ts`: pede ao jogador que mova o celular para frente e
  para tras ate a escala absoluta convergir;
- ancoragem **so libera** com `trackingStatus === "NORMAL"` — o mesmo criterio
  que o proprio overlay usa para sumir da tela — com escape apos 30 s presos em
  `LIMITED`, com aviso de precisao reduzida;
- politica de orientacao passou a ser **por modo de jogo**, escolhido na tela
  inicial: modo tela em paisagem travada, modo RA destravado;
- `DiagnosticsOverlay` (`?debug=1`) para medir no proprio HUD o que o celular nao
  deixa ver no console: `canvasAspect`, `videoAspect`, `orientation`,
  `trackingStatus`.

**Provou (o resultado grande desta etapa):**

1. **A calibracao era o gargalo.** Com o gate de `NORMAL`, o deslize caiu muito.
   Nao zerou — o que sobra e o salto de relocalizacao do `abac587`, que e limite
   do binario.
2. **Paisagem em RA funciona.** Com a tela **destravada** (que e o caminho atual:
   `enterAR()` chama `exitImmersiveMode()` antes de subir a sessao), tanto
   paisagem quanto portrait rodam bem. A conclusao de `ed93779` esta **revogada**
   na forma "RA nao funciona em paisagem".
3. **O que quebra e a troca de orientacao no meio da sessao.** Girar o aparelho
   com a sessao no ar deixa o 3D esticado. Escolher uma orientacao e ficar nela
   funciona; alternar, nao.

## Estado atual (2026-08-06)

| | Situacao |
|---|---|
| Paisagem destravada, sessao inteira | Funciona |
| Portrait, sessao inteira | Funciona |
| Girar o aparelho durante a sessao | **Quebra** — 3D esticado |
| Paisagem **travada** (`lock`), depois do gate de `NORMAL` | **Nao retestado** |
| Deslize residual (salto de relocalizacao) | Presente, mitigado, sem cura conhecida |

Por isso o comportamento em codigo continua o mesmo: a RA roda destravada e sem
tela cheia, e o overlay CSS "gire o celular" so aparece no modo tela. Nao adianta
convidar o jogador a girar se girar quebra.

## Hipoteses vivas para o 3D esticado ao girar

Em ordem de suspeita, com o teste que decide cada uma:

1. **Canvas redimensionado contra projecao congelada.** `src/main.ts` assina
   `onOrientationChange` e chama `engine.resize()` — inclusive durante a RA (o
   `relayout()` sai cedo, porque `scene.activeCamera` e a camera de RA, mas o
   `resize` roda). Do outro lado, a projecao da camera de RA e injetada e
   congelada por frame a partir das intrinsics do WASM. Canvas com aspecto novo
   contra intrinsics com aspecto velho estica exatamente assim. **Candidato mais
   forte.**
2. **`pixelRect` das intrinsics.** E o unico canal (`onCanvasSizeChange`) que nao
   leva `orientation`, e a gravacao inicial e
   `pixelRectWidth || (pixelRectWidth = canvasWidth)` — so grava se ainda for 0.
3. **Crop do feed da camera.** O `GlTextureRenderer` recalcula o crop do video
   contra o canvas; se o canvas girar sem o video acompanhar, o feed estica junto
   com a cena (nesse caso o esticamento aparece **tambem** na imagem da camera,
   nao so no 3D — e o jeito mais rapido de separar esta hipotese da 1).

**Como decidir:** abrir com `?debug=1`, entrar na RA, calibrar ate o overlay
sumir, ancorar a arena e girar o aparelho. Anotar `canvasAspect`, `videoAspect` e
`orientation` antes e depois. Se o `canvasAspect` inverte e o `videoAspect` nao,
e (1)/(2); se a imagem da camera tambem estica, e (3).

## Proximos passos

**1. Fechar a hipotese do esticamento** com a medicao acima. Se for (1), o
caminho e nao deixar o `engine.resize()` solto durante a sessao de RA (o engine
ja detecta mudanca de canvas sozinho, comparando dimensoes a cada frame no
`pre-render`).

**2. Retestar paisagem travada.** O experimento que condenou o lock rodou sem
gate de calibracao. Agora que existe, o teste vale de novo — e com o lock ativo o
SO **para de emitir `orientationchange`**, o que na pratica impede a troca de
orientacao que hoje quebra. Pode ser que o lock tenha virado a solucao do
problema que ele parecia causar.

**3. Investir nas guidelines do 8th Wall para orientar o jogador.** Este e o item
de maior retorno por esforco. O deslize residual e limite do SLAM, mas boa parte
da experiencia ruim vem de o jogador nao saber o que fazer — e a documentacao do
8th Wall e explicita sobre isso:

- **superficie com textura e contraste**: concreto, grama, cascalho, tapete
  estampado. Superficies lisas e uniformes dao tracking ruim independente da cor;
- **luz uniforme**, sem brilho forte nem sombra dura;
- **mover devagar**, principalmente no inicio da sessao;
- **onboarding e responsabilidade do app**: o coaching overlay cobre a
  calibracao de escala, mas a escolha do lugar e do ritmo precisa ser dita ao
  jogador antes disso.

O jogo hoje pede o movimento de calibracao (via coaching overlay) e nada mais.
Falta a etapa anterior: dizer onde apontar e por que. Vale ler antes de
implementar:

- https://www.8thwall.com/docs/studio/troubleshooting/world-tracking-issues/
- https://www.8thwall.com/docs/legacy/guides/advanced-topics/coaching-overlays/
- https://www.8thwall.com/docs/api/coachingoverlay/configure/

Os docs migraram para `8thwall.org` e o site e uma SPA — os links acima
redirecionam e precisam ser abertos no navegador.
