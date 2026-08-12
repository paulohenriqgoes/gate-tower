# Experimento: arena estavel em RA e layout paisagem

Diario do experimento que atravessou as branches `paulo/8th-wall` e
`paulo/landscape-layout`. Registra **o que foi tentado, o que cada tentativa
provou e o que ainda esta aberto** — inclusive as conclusoes que foram
desmentidas depois. Ultima atualizacao: **2026-08-12**.

## Objetivo

Um jogo de cartas com lanes, jogado com o celular deitado (landscape-first), com
a arena ancorada no chao real via SLAM do 8th Wall — rodando no navegador, sem
app, em iOS e Android.

Duas exigencias que puxam em direcoes diferentes:

- o **HUD** quer paisagem (lanes largas, cartas na borda direita);
- o **tracking** e sensivel a tudo que mexe em orientacao, viewport e projecao.

O experimento e sobre encontrar o ponto onde as duas coisas convivem.

**Atualizacao de escopo (2026-08-12):** esta tensao foi **dissolvida por
decisao**, nao resolvida por experimento. A spec da demo travou o jogo em
**retrato** e tirou paisagem de escopo, entao o HUD deixou de puxar para o lado
oposto do tracking. O objetivo original fica registrado acima porque explica
metade da linha do tempo abaixo; a partir de `(sem commit) — retrato travado`, o
diario passa a ser sobre **estabilidade da arena em retrato**.

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

### (sem commit) — retrato travado e o drift ao circular a arena (2026-08-12)

**Feito:** a spec da demo (que tem precedencia declarada sobre o README) fechou
a questao da orientacao por decisao de recorte, nao por experimento: **retrato
travado, nos dois modos**, sem suporte a rotacao. Em codigo:

- `enterImmersiveMode()` passou a travar em `"portrait-primary"` e e chamado
  **antes** de subir a sessao de RA (o `enterAR()` nao chama mais
  `exitImmersiveMode()`); no iOS Safari, onde `lock` nao existe, o overlay CSS
  de `index.html` — agora incondicional e invertido para pedir retrato — assume;
- `src/main.ts` **deixou de chamar `engine.resize()` enquanto a sessao de RA
  esta ativa**;
- a camada landscape-first saiu: `arenaFraming.ts` desconta a faixa do HUD do
  FOV **vertical** (o HUD foi para o terco inferior), e a classe
  `needs-landscape` do `GameFlow` deixou de existir.

**Provou:** nada sobre orientacao. Esta entrada e uma **decisao de produto**, nao
um resultado — e importante nao confundir as duas coisas neste diario, que ja
pagou o preco disso uma vez (ver `ed93779`).

Duas consequencias que precisam ficar registradas com honestidade:

1. **O conserto da hipotese 1 foi aplicado sem a hipotese ter sido decidida.**
   Tirar o `engine.resize()` de dentro da sessao era exatamente o conserto
   previsto para a hipotese "canvas redimensionado contra projecao congelada" —
   mas ele foi feito por causa da trava de retrato, nao porque a medicao foi
   feita. A medicao **nao foi feita**.
2. **O cenario que decidia a hipotese saiu do produto.** Com retrato travado,
   girar durante a sessao deixa de acontecer no caminho normal. A hipotese
   continua **sem veredito** e agora so pode ser decidida num teste deliberado,
   fora do fluxo do jogo.

**Resultado em device (2026-08-12, celular com RA e desktop sem RA):** um achado
novo, que nao e sobre orientacao e por isso abre uma frente propria:

- **circular a arena funciona so em partes.** Ir para **tras** da torre inimiga
  foi descrito como "um desafio": ao contornar, a camera passa a enquadrar area
  que o SLAM ainda nao mapeou, e o conteudo comeca a driftar.

**Hipotese do usuario, registrada como hipotese:** "talvez a arena precise ser
fixada de lado" — ou seja, orientar a arena de modo que o jogador circule pelo
eixo ja mapeado em vez de atravessar para o lado desconhecido.

**Afirmacao do usuario, nao medida nesta sessao:** "na api de WebXR isso nao
acontece". Isso e relato de experiencia anterior, nao um A/B feito agora, e
contradiz a premissa que motivou a migracao para o 8th Wall (WebXR inviavel no
iOS/Safari). Fica como hipotese 4 abaixo, com o teste que a decide — nao como
conclusao.

## Estado atual (2026-08-12)

| | Situacao |
|---|---|
| Retrato travado, sessao inteira | Adotado por decisao de recorte; **explorar a arena confirmado em device** |
| Paisagem (qualquer variante) | **Fora de escopo** da demo — nao e mais mantido em codigo |
| Girar o aparelho durante a sessao | **Quebra** (resultado de 2026-08-06); agora **prevenido** pela trava, nao corrigido |
| Deslize residual (salto de relocalizacao) | Presente, mitigado, sem cura conhecida |
| Circular a arena pela frente/lados | Funciona |
| Passar para **tras** da arena | **Quebra** — drift ao enquadrar area nao mapeada pelo SLAM |

O comportamento em codigo mudou: a RA agora roda **travada em retrato**, com o
lock pedido antes de subir a sessao, e o overlay CSS de rotacao vale para os dois
modos. A logica antiga ("nao adianta convidar o jogador a girar") continua
valendo — a diferenca e que agora o jogo impede a rotacao em vez de conviver com
ela.

## Hipoteses vivas atualizadas em (2026-08-12)

As tres primeiras sao sobre o 3D esticado ao girar e **perderam prioridade**: com
retrato travado, girar durante a sessao saiu do caminho normal do jogo. Elas
ficam registradas porque o cenario ainda existe (um aparelho sem `lock`, como o
iPhone no Safari, so tem o overlay CSS impedindo — e overlay nao impede, so pede)
e porque a hipotese 1 teve o **conserto aplicado sem veredito**.

A hipotese 4 e nova e e a que importa agora.

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

**Como decidir (1, 2 e 3):** abrir com `?debug=1`, entrar na RA, calibrar ate o
overlay sumir, ancorar a arena e girar o aparelho. Anotar `canvasAspect`,
`videoAspect` e `orientation` antes e depois. Se o `canvasAspect` inverte e o
`videoAspect` nao, e (1)/(2); se a imagem da camera tambem estica, e (3).
Com a trava de retrato isso agora exige um teste **deliberado** (desligar o lock
a mao), porque o jogo nao produz mais esse cenario sozinho.

4. **O drift ao passar para tras da arena e area nao mapeada pelo SLAM, nao
   ancoragem.** O sintoma aparece exatamente quando a camera enquadra pela
   primeira vez o lado oposto — que o SLAM nunca viu, e onde ele tem poucos
   feature points para se localizar. Isso e diferente dos dois deslizes de
   `abac587`: nao e profundidade errada (place-once resolveu) nem salto de
   relocalizacao com o aparelho parado; e degradacao de tracking por falta de
   mapa. **Teste:** com `?debug=1`, andar em volta da arena anotando
   `trackingStatus` a cada quadrante. Se ele cair de `NORMAL` para `LIMITED`
   justamente ao cruzar para tras, a hipotese esta confirmada. Mitigacao a
   avaliar depois: pedir ao jogador, no onboarding, que **varra o ambiente
   inteiro antes de ancorar** (as guidelines do 8th Wall pedem exatamente isso),
   e a sugestao do usuario de **orientar a arena de lado**, para o caminho
   natural de circulacao ficar dentro da area ja mapeada.

5. **"Em WebXR isso nao acontece" (afirmacao do usuario, 2026-08-12).** Se for
   verdade, e um dado forte contra a escolha de engine — mas nao foi medido lado
   a lado nesta sessao, e o projeto migrou de WebXR para 8th Wall por um motivo
   independente (WebXR nao roda no Safari do iPhone), que continua valendo.
   **Teste:** rodar o mesmo percurso (contornar ate atras da arena) nas duas
   implementacoes, **no mesmo aparelho Android e no mesmo ambiente**, anotando
   quando o conteudo comeca a driftar. Cuidado com o vies de comparar memoria de
   uma sessao antiga com uma sessao nova: so vale medicao feita no mesmo dia,
   com o mesmo cenario.

## Proximos passos (atualizados em 2026-08-12)

**1. Decidir a hipotese 4 (drift ao passar para tras).** E o unico problema de
tracking que aparece no caminho normal do jogo hoje. Medicao barata: circular a
arena com `?debug=1` anotando `trackingStatus` por quadrante.

**2. Retestar o criterio do Beat 3** — arena nao desliza mais que ~2 cm em 60 s
circulando a mesa. Nao foi medido depois da arena virar 80 cm com escala fixa.

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
