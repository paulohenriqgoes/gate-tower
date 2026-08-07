# AR/XR Imersivo com 8th Wall + Babylon.js

## Por que 8th Wall (e não só o WebXR nativo do Babylon.js)

Babylon.js já tem suporte nativo a WebXR (`scene.createDefaultXRExperienceAsync()`), mas WebXR só funciona nos navegadores/dispositivos que implementam a API — na prática isso deixa de fora Safari no iOS para a maioria dos casos de AR baseada em câmera. O 8th Wall resolve isso com sua própria implementação de SLAM (world tracking) que roda em WebGL puro, funcionando em qualquer navegador móvel moderno (Android e iOS) sem exigir suporte a WebXR nem instalação de app. Use esta referência quando o pedido for AR "que funciona em qualquer celular pelo link", diferente de VR/XR para headsets dedicados (onde WebXR nativo do Babylon.js é o caminho certo).

## O que mudou: a plataforma hospedada foi aposentada

Tutoriais antigos (incluindo o vídeo oficial de integração com Babylon.js) mostram um fluxo baseado em criar conta em 8thwall.com, pegar um `appKey`, e carregar o engine via `<script src="//apps.8thwall.com/xrweb?appKey=XXXX">`. **Esse serviço hospedado foi aposentado em 28/02/2026** — experiências já publicadas continuam rodando até 28/02/2027, mas não é mais o caminho para projetos novos. Hoje o engine é distribuído para você mesmo hospedar (npm ou CDN), sem `appKey` e sem depender de conta na 8th Wall. Se o usuário colar um tutorial antigo com `appKey`, adapte para o fluxo self-hosted abaixo.

## Licenciamento: o que é MIT e o que não é

Isso importa porque muda o que você pode prometer ao usuário sem checar de novo:

| Distribuição | Licença | Inclui |
|---|---|---|
| **Open Source Engine Framework** (`packages/engine` no GitHub) | MIT, sem restrição comercial | Arquitetura central do engine, **Face Effects**, **Image Targets**, **Sky Effects** |
| **Distributed Engine Binary** | Binário fechado, uso comercial/não-comercial permitido gratuitamente | Tudo acima **+ SLAM (World Tracking)** |

Ou seja: **World Tracking (colocar objetos 3D ancorados no espaço real, andar ao redor deles) exige o binário distribuído**, que é gratuito mas não é MIT — ele exige manter um aviso de copyright visível no projeto (arquivo `LICENSE` original do bundle `xr.js`, ou o texto de copyright em `index.html` se os arquivos forem modificados). Para apps compilados/empacotados (não-web), o aviso precisa aparecer em algum lugar visível da experiência (tela de créditos/sobre), já que o usuário final não tem como inspecionar o código-fonte. Se o jogo do usuário só precisa de Face Effects, Image Targets ou Sky Effects (sem ancoragem livre no mundo), o pacote 100% MIT já resolve e não traz essa obrigação extra.

## Instalando o engine (Vite)

```bash
npm install @8thwall/engine-binary
```

Copie os artefatos do pacote para a pasta pública do Vite (equivalente ao `CopyWebpackPlugin` usado nos exemplos oficiais com Webpack) — um jeito simples é um script `postinstall` ou um plugin de cópia de assets do Vite apontando `node_modules/@8thwall/engine-binary/dist` para `public/external/xr`. Depois, no `index.html`:

```html
<script src="/external/xr/xr.js" async data-preload-chunks="slam"></script>
```

`data-preload-chunks` controla quais partes do engine baixar: `"slam"` para World Tracking/Image Targets, `"face"` para Face Effects, ou nenhum atributo para Sky Effects. Para uma experiência que combina, por exemplo, world tracking e face effects: `data-preload-chunks="slam, face"`.

## Integrando com Babylon.js: Camera Pipeline Modules

O 8th Wall não usa o render loop do Babylon.js como dono da cena — ele é quem controla a câmera do dispositivo e injeta a posição rastreada na câmera do Babylon.js a cada frame, através de um sistema de **Camera Pipeline Modules**. Isso é uma inversão importante em relação ao resto desta skill: em uma experiência AR, você não cria sua própria `ArcRotateCamera`/`FreeCamera` (ver `architecture.md` e `gameplay-systems.md`) — a integração com Babylon.js cria a `Scene` e a câmera para você, e entrega ambas no callback de inicialização.

```ts
// arScenePipelineModule.ts
const initXrScene = ({ scene, camera }: { scene: BABYLON.Scene; camera: BABYLON.Camera }) => {
  const light = new BABYLON.DirectionalLight("light", new BABYLON.Vector3(0, -1, 1), scene);
  light.intensity = 1.0;

  // Conteúdo do seu jogo AR entra aqui — carregado normalmente via
  // LoadAssetContainerAsync como descrito em gameplay-systems.md
};

const arScenePipelineModule = () => ({
  name: "ar-scene",
  onStart: ({ canvas }: { canvas: HTMLCanvasElement }) => {
    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const { scene, camera } = XR8.Babylonjs.xrScene(); // scene e camera gerenciadas pelo 8th Wall
    initXrScene({ scene, camera });

    engine.runRenderLoop(() => scene.render());
  },
});

const onxrloaded = () => {
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),   // desenha o feed da câmera
    XR8.Babylonjs.pipelineModule(),           // integra Babylon.js ao ciclo de vida do 8th Wall
    XR8.XrController.pipelineModule(),        // habilita SLAM (world tracking)
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    arScenePipelineModule(),
  ]);

  XR8.run({ canvas: document.getElementById("camerafeed") as HTMLCanvasElement });
};

window.XR8 ? onxrloaded() : window.addEventListener("xrloaded", onxrloaded);
```

A ordem dos módulos importa: o `GlTextureRenderer` precisa vir antes de quem desenha conteúdo por cima do feed da câmera, e `XrController` é o que liga o SLAM propriamente dito. Os módulos `XRExtras` (loading screen, tratamento de erro, canvas full-window) não são obrigatórios, mas evitam ter que reimplementar UX básica de permissão de câmera/erro que toda experiência AR precisa.

### Onde isso se encaixa na arquitetura de estados

Trate a experiência AR como **um `GameState` cuja `enter()` não cria `Scene`/câmera própria** — ele recebe ambas do 8th Wall e as guarda, em vez de instanciar como os outros estados fazem. O `exit()` desse estado deve parar o `XR8.run()`/pausar o pipeline além de chamar `scene.dispose()`, já que a câmera do dispositivo continua ligada até ser explicitamente encerrada.

## World Tracking: colocar objetos no mundo real

Use `XR8.XrController.hitTest()` para estimar a posição 3D correspondente a um ponto tocado na tela (ex.: "toque no chão para colocar o personagem"):

```ts
canvas.addEventListener("touchstart", (e) => {
  const touch = e.touches[0];
  const x = touch.clientX / window.innerWidth;
  const y = touch.clientY / window.innerHeight;
  const results = XR8.XrController.hitTest(x, y, ["FEATURE_POINT"]);
  if (results.length > 0) {
    const { position, rotation } = results[0];
    // posicione sua mesh Babylon.js usando position/rotation
  }
});
```

Se o jogo não precisa de ancoragem livre no mundo (por exemplo, um filtro de rosto ou um efeito de céu), desabilite o SLAM explicitamente antes de `XR8.run()` — isso economiza processamento em dispositivos mais fracos: `XR8.XrController.configure({ disableWorldTracking: true })`.

## Image Targets

Para experiências ancoradas a uma imagem específica (embalagem de produto, pôster, cartão), configure os alvos antes de rodar o engine:

```ts
XR8.XrController.configure({
  imageTargets: ["meu-alvo-1", "meu-alvo-2"],
});
```

Cada alvo precisa ser processado previamente (upload da imagem de referência) — sem isso, o SLAM de world tracking geral ainda funciona, mas o reconhecimento específico daquela imagem não. Assim como no world tracking por toque, o objeto que você quer "grudar" na imagem deve ser reposicionado a cada frame com a pose reportada pelo evento correspondente do `XrController`, não fixado uma única vez.

## Cuidados de performance específicos de AR (além de `performance.md`)

AR roda a decodificação da câmera, o SLAM e o render do Babylon.js ao mesmo tempo, no mesmo dispositivo móvel — a margem de hardware é bem menor que em um jogo 3D comum, então os cuidados de `performance.md` (instancing, texturas comprimidas, formas de colisão simples) deixam de ser "nice to have" e passam a ser necessários desde o protótipo:

- Prefira poucos objetos com poucos materiais no conteúdo de AR — cada draw call compete por orçamento de frame com o próprio tracking.
- Teste em iOS Safari e em Android Chrome cedo — SLAM baseado em WebGL tem diferenças reais de estabilidade de tracking entre os dois, que não aparecem testando só em um.
- HTTPS é obrigatório para acesso à câmera fora de `localhost`. Para testar no celular durante o desenvolvimento, sirva o projeto Vite com um túnel HTTPS (ex.: `ngrok http <porta>`) apontando para o servidor de dev do Vite, já que a maioria dos celulares não vai aceitar certificado autoassinado sem fricção.
- A primeira interação do usuário (toque para conceder permissão de câmera) é obrigatória por política dos navegadores — planeje uma tela inicial que peça esse toque explicitamente, em vez de tentar iniciar o `XR8.run()` sozinho no carregamento da página.

## Troubleshooting: drift e grounding em AR (lições de campo)

Estes são os problemas que **só aparecem no device** com world tracking real — não dá pra pegar no desktop (o SLAM não roda fora do celular). Trate esta seção como um playbook de diagnóstico.

### Passo 1 — separe os DOIS "drifts", porque a cura é diferente

Quando o usuário diz "a arena não fica no lugar", quase sempre é um de dois fenômenos distintos:

1. **Salto de relocalização (SLAM):** o sistema de coordenadas inteiro dá um pulo quando o engine re-localiza. Acontece **com o celular parado ou não**, em degrau. **Nada** que você pendura na cena corrige — o binário distribuído do 8th Wall não expõe anchor persistente por objeto em world tracking (só `recenter()`). Dá pra **mitigar/mascarar** (gating por tracking status, absorção de salto, ou pivotar para **Image Target** que tem anchor real), nunca eliminar.
2. **Escorregar por profundidade errada:** a arena "desliza em relação ao chão real" **só quando a câmera se move** (pior ao aproximar — paralaxe é máxima perto). Isso é âncora na profundidade errada, **não** SLAM. **Esse tem cura.**

Pergunta de triagem: "escorrega parado, ou só quando você move o celular?" → parado = item 1; só movendo = item 2.

### Passo 2 — conserte o item 2 (o comum): place-once na superfície real

A causa clássica é posicionar o conteúdo por raycast contra um **plano matemático `y=0`** (a altura inicial do celular, não o chão real). Um ponto fixo na profundidade errada se projeta em lugares diferentes do piso conforme a câmera anda → "escorrega".

Receita (não precisa de reancoragem contínua — ela é pro item 1 e costuma introduzir *swim*/tremor):

- No toque, dispare **vários `hitTest`** num grid ao redor do ponto (não um só — um feature point ruim faz a arena pular).
- Faça **fit de um plano** com os pontos: altura mediana + rejeição de outlier (MAD); normal por mínimos quadrados (campo de altura `y=a·x+b·z+c`, resolvido por Cramer).
- Posicione na **profundidade real** e **trave**. Um ponto fixo na altura certa fica grudado quando você anda.
- Ofereça um botão **"reposicionar"** manual para o resíduo (que é item 1).

### Passo 3 — gotchas que travam tudo

- **`hitTest` estoura o WASM se chamado cedo demais.** Chamar `XR8.XrController.hitTest` antes do SLAM ter pose lança `RuntimeError: memory access out of bounds` — e no render loop isso **mata o app inteiro**. Faça gate: só chame quando o `trackingStatus === "NORMAL"` (via `onUpdate` → `event.processCpuResult.reality.trackingStatus`), e envolva toda chamada em `try/catch` como rede de segurança. Cuidado: `LIMITED` pode ter pose mas deixar o tracking instável demais para posicionar bem — prefira `NORMAL`.
- **Normalização de coordenadas do `hitTest`.** As coords são `[0,1]`. Normalize por `canvas.clientWidth/clientHeight` (**px CSS**), **nunca** por `engine.getRenderWidth/Height()` (px de dispositivo, ×devicePixelRatio ~3 no mobile). Misturar faz o hitTest mirar no lugar errado.
- **Celular não tem console acessível.** Não dá pra depender de `console.log` no device. Jogue estado crítico (ex.: `trackingStatus`) **na própria tela** (um `TextBlock`/GUI). Isso desbloqueia o diagnóstico remoto.
- **Tilt: o "up" do SLAM às vezes não bate com o piso.** Se a arena parece levemente inclinada (um lado "pra cima"), alinhe o *up* do conteúdo à **normal medida** no fit do plano — com um clamp (ex.: rejeitar normais > ~12° da vertical, que são ruído) pra nunca tombar.

### Passo 4 — grounding: faça parecer que está no chão

O tracking pode estar perfeito e ainda "parecer flutuando". O que resolve é **pista visual**, não mais precisão:

- **Esconda o chão virtual opaco em AR.** Um grid/xadrez opaco **compete** com o piso real e denuncia o plano flutuante. Agrupe os tiles sob um nó e desligue-o ao entrar em AR (mantenha no modo não-AR). **Gotcha de picking:** se o chão virtual era a superfície de toque (deploy, seleção), esconder os tiles quebra isso — use um ground **invisível-mas-pickável** com `visibility = 0` (NÃO `isVisible = false`, que remove a mesh do picking do Babylon).
- **Sombra de contato (blob), não shadow-mapping.** Em AR mobile, prefira um "blob" — um disco com gradiente radial transparente sob cada entidade — a shadow-mapping real. É mais barato (a câmera + SLAM já comem o frame), sem dependência extra, e **robusto em qualquer escala** (shadow map numa arena em escala 0.02 é frágil). Ancora tanto ou mais.
- **Anime a entrada.** Fazer o conteúdo **surgir crescendo** (escala 0→alvo com ease-out) em vez de aparecer de uma vez, além de charme, **mascara o "snap"** da ancoragem inicial.

### Passo 5 — coaching: orientar o jogador rende mais que perseguir precisão

Chega um ponto em que o tracking está no limite do que o SLAM entrega, e o que ainda melhora a experiência é **o usuário fazer a coisa certa** — apontar para uma superfície que dá para rastrear, mover devagar, e mover o suficiente para a escala convergir. Isso é responsabilidade do app, não do engine, e é a parte que quase todo protótipo pula.

- **Escala absoluta precisa de paralaxe.** Com `XR8.XrController.configure({ scale: "absolute" })`, a escala só converge depois que o jogador move o celular para frente e para trás. **Não ancore nada antes disso** — se ancorar, o conteúdo nasce com tamanho e profundidade errados e desliza, e você vai debitar isso do tracking (ou da orientação da tela, ou de qualquer outra coisa que estiver mexendo na hora). Antes de investigar qualquer instabilidade, garanta que a calibração já aconteceu; sem isso, toda medição fica contaminada.
- **Use o coaching overlay oficial** (`@8thwall/coaching-overlay`, MIT) em vez de escrever o seu. Ele é o `Absolute Scale Coaching Overlay`: animação + texto pedindo o movimento de vai-e-vem. Instale como pipeline module e configure textos/cores com `CoachingOverlay.configure({ promptText, promptColor, animationColor })`.
- **O critério de exibição, confirmado no bundle:** aparece quando `trackingStatus === "LIMITED" && trackingReason === "INITIALIZING"`, some quando `trackingStatus === "NORMAL"`. Ou seja, **`NORMAL` é o sinal oficial de "calibrado"** — use o mesmo critério para liberar a ancoragem no seu app, e você fica alinhado com o que o overlay está prometendo ao jogador. Dê um escape temporizado (ex.: depois de ~30 s preso em `LIMITED`, liberar com aviso de precisão reduzida) para ambientes sem textura, senão o jogo trava para sempre numa sala de parede lisa.
- **Remova o módulo quando o setup terminar** (`removeCameraPipelineModule("coaching-overlay")`). Se o tracking degradar no meio da partida, o overlay reaparece por cima do jogo.
- **Detalhe de integração:** o overlay é **DOM** (`position: fixed`, `z-index: 412`, montado em `document.body`), não GUI do Babylon — não tente encaixá-lo numa `AdvancedDynamicTexture`.
- **O que as guidelines do 8th Wall pedem ao usuário** — vale repetir no seu HUD, na tela antes da AR: superfície com **textura e contraste** (concreto, grama, cascalho, tapete estampado; superfície lisa e uniforme dá tracking ruim independente da cor), **luz uniforme** sem brilho forte nem sombra dura, e **mover devagar**, principalmente no começo. O coaching overlay cobre só a calibração de escala — dizer *onde apontar* é a etapa anterior, e é sua.
- Para consultar: [World Tracking Issues](https://www.8thwall.com/docs/studio/troubleshooting/world-tracking-issues/), [guia de Coaching Overlays](https://www.8thwall.com/docs/legacy/guides/advanced-topics/coaching-overlays/), [`CoachingOverlay.configure()`](https://www.8thwall.com/docs/api/coachingoverlay/configure/). Os docs migraram para `8thwall.org` e o site é uma SPA — esses links redirecionam e precisam ser abertos no navegador (fetch de conteúdo não funciona bem neles).

### Limite honesto para setar expectativa

World tracking do binário distribuído **não tem anchor persistente por objeto** — só `recenter()`/`recenterWithOrigin`. Então saltos de relocalização (item 1) são **mitigados**, nunca 100% eliminados. Se a estabilidade for inegociável (ex.: jogo de mesa), avalie ancorar num **Image Target** (playmat impresso): aí há anchor real e o conteúdo trava no marcador físico.

## Orientação de tela (landscape/portrait), fullscreen e AR

Orientação de tela parece uma decisão de UI inofensiva, mas em AR com world tracking ela mexe direto em como o engine calcula IMU e projeção de câmera a cada frame. Trate isto como uma seção irmã do troubleshooting de drift acima: mesmo espírito ("só aparece no device"), causa diferente.

### Como o engine consome orientação (confirmado por engenharia reversa do bundle)

- **Não é lido uma vez no início da sessão.** A cada frame, o `frameStartResult` é remontado com `orientation: K()`, e `K()` lê `screen.orientation.angle` ao vivo — não existe cache por sessão. Esse valor vai a cada frame para o WASM via `_c8EmAsm_stageFrame(textureName, texW, texH, orientation, alpha, beta, gamma, qw, qx, qy, qz, videoTime, frameTime, now, lat, lon, acc)`. Se a hipótese de trabalho for "travar cedo, esperar a viewport estabilizar e o problema some", vale desmentir logo: a leitura é contínua, não é um valor congelado no início.
- **`K()` mapeia `angle` assim:** `0→0`, `90→90`, `180→180`, `270→-90`. As duas variantes de paisagem dão valores **diferentes** — `landscape-primary` = 90, `landscape-secondary` = -90. O engine nunca lê `screen.orientation.type`, só `angle`. Em desktop (device não reconhecido como MOBILE) o retorno é fixo em `90`.
- **O IMU é repassado cru.** `deviceorientation` (alpha/beta/gamma) vira um quaternion ZXY em JS **sem nenhuma compensação pelo ângulo de tela e sem troca de eixos X/Y**; `devicemotion` vai direto ao WASM. A compensação para paisagem é 100% responsabilidade do WASM, usando o argumento `orientation` — ou seja: **se o `orientation` reportado discordar da pose física real do aparelho, o IMU inteiro entra girado**. É o ponto único de falha do sistema.
- **Três canais atualizam o estado do WASM, e um deles é assimétrico:**
  - `onVideoSizeChange` → `_c8EmAsm_engineVideoSizeChange(videoW, videoH, orientation)` — leva orientation
  - `onDeviceOrientationChange` → `_c8EmAsm_engineOrientationChange(videoW, videoH, orientation)` — leva orientation
  - `onCanvasSizeChange` → só atualiza `pixelRectWidth/pixelRectHeight` — **não leva orientation**
- **As constraints do `getUserMedia` são fixas e sempre em formato paisagem** (ex.: `{width:{exact:1280},height:{exact:720}}`, `{width:{min:960},height:{min:720}}`, `{width:{min:640},height:{min:480}}`), sem qualquer relação com a orientação da tela. O vídeo chega em coordenadas de sensor; não há re-request de stream ao girar o aparelho.
- **`camera.fov`/`camera.aspectRatio` do Babylon não são usados em AR.** A matriz de projeção inteira é injetada por frame a partir das intrinsics do WASM via `camera.freezeProjectionMatrix(matrix)`. O `pixelRect` que gera essas intrinsics é gravado uma vez no `onAttach` (`pixelRectWidth || (pixelRectWidth = canvasWidth)` — repare no `||`: só grava se ainda for `0`) e depois só muda via `onCanvasSizeChange`.
- **O engine detecta resize de canvas sozinho.** Ele compara as dimensões do canvas com um cache **a cada frame** no `pre-render` e dispara `onCanvasSizeChange`. Ou seja, chamar `engine.resize()` do Babylon durante a sessão é redundante — e, pelo resultado empírico abaixo, não é inofensivo como parecia: `onCanvasSizeChange` é o canal que atualiza `pixelRect` **sem** `orientation`.

### Resultado empírico (Android, device real)

**Paisagem em AR funciona — o que quebra é trocar de orientação no meio da sessão.** Com a tela **destravada**, tanto paisagem quanto portrait rodam bem a sessão inteira. Girar o aparelho com a sessão no ar deixa a cena esticada.

Duas ressalvas importantes de metodologia, porque elas explicam por que a conclusão anterior era outra:

- **Uma rodada anterior deste mesmo experimento concluiu que "AR em paisagem não funciona".** Foi um resultado contaminado: naquele momento não havia gate de calibração, então a arena era ancorada **antes** da escala absoluta convergir e deslizava de qualquer jeito, em qualquer orientação. Depois de condicionar a ancoragem a `trackingStatus === "NORMAL"` (ver Passo 5 acima), paisagem passou a funcionar. **Antes de culpar orientação por instabilidade, garanta que a calibração já aconteceu** — senão você está medindo duas coisas e creditando a uma.
- **Paisagem com `screen.orientation.lock()` não foi retestada** depois do gate de calibração. A rodada antiga (com lock) foi ruim, mas pelo motivo acima isso não é evidência limpa. Trate como **em aberto**, não como fato — e note a ironia possível: com o lock ativo o SO **para de emitir `orientationchange`**, o que impede justamente a troca de orientação que hoje quebra.

Para o esticamento ao girar, a suspeita é a projeção: em AR ela é **injetada e congelada por frame** a partir das intrinsics do WASM, enquanto o canvas é redimensionado pelo `orientationchange` (inclusive por um `engine.resize()` do seu próprio app, se você assina esse evento e não pula durante a AR). Canvas com aspecto novo contra intrinsics com aspecto velho estica exatamente assim. Suspeito irmão: o `pixelRect`, que vem do único canal que **não** leva `orientation`.

### Recomendações

- **Escolha uma orientação por sessão e não troque no meio.** Se o jogo é paisagem, peça a paisagem **antes** de subir a sessão de AR — não durante. Uma sessão inteira em paisagem é um cenário validado; alternar não é.
- **Se você assina `orientationchange`/`resize` para reenquadrar câmera ou HUD, pule o trabalho enquanto a sessão de AR está ativa.** O engine já detecta mudança de canvas sozinho (compara as dimensões a cada frame no `pre-render` e dispara `onCanvasSizeChange`) — chamar `engine.resize()` por fora é redundante e é o principal suspeito de deixar a projeção fora de sincronia com o canvas.
- Se for travar a orientação: use lock específico (`screen.orientation.lock("landscape-primary")`), nunca o genérico `"landscape"` — o genérico trava na variante em que o aparelho já estiver, e as duas variantes dão `angle` diferente (90 vs -90). Peça o lock **antes** de subir a sessão.
- Valide em device antes de construir o layout em cima de uma premissa de orientação. O celular não tem console acessível: logue no próprio HUD `videoTrack.getSettings()`, `video.videoWidth/videoHeight`, `canvas.width/height`, `engine.getRenderWidth()/getRenderHeight()`, `screen.orientation.type` e `screen.orientation.angle` — no init e a cada `orientationchange`. Comparar **aspect ratio do canvas contra o do vídeo, antes e depois de girar**, é o teste que separa "projeção dessincronizada" de "crop do feed".
- `screen.orientation.lock()` exige fullscreen no Android/Chrome e **não existe no Safari do iPhone** (existe no iPadOS). No iPhone, tela cheia real só via "Adicionar à Tela de Início" com manifest (`display: fullscreen`, `orientation: landscape`) + metas `apple-mobile-web-app-capable`. Fallback universal para pedir rotação, sem depender de nenhuma dessas APIs: overlay CSS com `@media (orientation: portrait) and (pointer: coarse)` — funciona sem JS, antes mesmo da cena carregar.
- Evite pedir fullscreen/lock **com a sessão de AR no ar**: isso não corrompe a orientação reportada (o valor é lido ao vivo, ver item acima), mas redimensiona o canvas e reprojeta a cena no meio do tracking — ruído gratuito em cima de algo já sensível. Peça antes de subir a sessão.
