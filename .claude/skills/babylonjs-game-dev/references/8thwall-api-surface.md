# Superfície de API real do 8th Wall (engine binário self-hosted)

Este documento descreve o que existe de fato em `@8thwall/engine-binary` — não o que os
tutoriais dizem, não o que a doc promete, mas o que os bundles executam. É referência de
API, não guia de troubleshooting: para drift, grounding, orientação de tela e as
lições de campo de AR, ver `ar-xr-8thwall.md` (que cobre outro terreno e está sendo
reescrito separadamente — não copie exemplos de código daqui para lá nem o contrário sem
reconferir).

## Como ler este documento

Toda afirmação aqui carrega uma de três procedências:

1. **Trecho do bundle**, citado como `` `arquivo.js` char N `` — N é o offset de caractere
   em `s = fs.readFileSync("arquivo.js", "utf8")`, achado com a receita do `node -e` +
   `indexOf` (ver exemplo no início da sessão que gerou este documento). Bundles
   minificados não têm quebras de linha úteis, então offset de caractere é o endereço que
   sobra — reproduza com `s.slice(N-100, N+200)`. Código minificado citado em bloco foi
   **reformatado com quebras de linha e indentação para legibilidade** — identificadores
   de uma/duas letras (`A`, `g`, `xA`) foram mantidos exatamente como no bundle, só o
   espaçamento mudou. Nada de semântica foi alterado.
2. **Arquivo de exemplo oficial**, citado com caminho relativo ao clone (`studio-world-effects-example/src/tap-to-place.ts`, `threejs-world-effects-example/src/threejs-scene-init.js`) ou ao clone do monorepo (`packages/xrextras/src/...`).
3. **URL da doc** (`8thwall.org/docs/...`), buscada via WebFetch. **Ressalva importante:**
   WebFetch não devolve o HTML bruto — passa o conteúdo por um resumidor de IA antes de
   devolver. Toda citação de doc aqui é "o que o WebFetch reportou da página", não a
   transcrição literal do HTML. Onde isso importa (ex.: a assinatura de `XR8.run()`
   reportada com argumentos posicionais, que contradiz todo código-exemplo real), o
   documento sinaliza a suspeita explicitamente em vez de tratar o retorno como verdade
   absoluta.

Sem uma dessas três, a afirmação não entra. Onde bundle e doc divergem, os dois ficam
registrados — ver a tabela final.

**Fingerprint dos bundles usados nesta mineração** (eles vão mudar em upgrades do
engine; se os offsets acima não baterem, é isso): `public/8thwall/xr.js` — 1.036.695
bytes, sha256 `b397393686...`; `public/8thwall/xr-slam.js` — 5.538.007 bytes, sha256
`398f675c92...`. Ambos vêm do pacote npm `@8thwall/engine-binary@1.0.0` (o range no
`package.json` do projeto é `^1.0.0`; essa é a versão de fato instalada em
`node_modules`).

## `XR8` — o global

`window.XR8` é montado por `xr.js` a partir de dois grupos de coisas: (a) um núcleo
interno de ciclo de vida (chamado aqui de "engine core", já que o bundle não expõe o
nome da variável fora do escopo do IIFE) e (b) integrações de engine + namespaces
utilitários, todos criados eager exceto `XrController` e `FaceController`, que começam
`null` e só existem depois de `loadChunk("slam")`/`loadChunk("face")`.

Confirmado no retorno do objeto público (`xr.js`, dentro do factory que monta
`window.XR8`, logo após `Babylonjs:mQ()`):

```js
{
  // engine integrations
  Babylonjs: mQ(), PlayCanvas: qQ(), Sumerian: HC, Threejs: BQ(),
  CloudStudioThreejs: tQ(), AFrame: {...},
  // namespaces utilitários
  Platform: NB(), Vps: xB(), XrConfig: B(), XrDevice: Dg(), XrPermissions: vg(),
  CanvasScreenshot: hg(), MediaRecorder: DB(), YuvPixelsArray: lB,
  CameraPixelArray: vI, GlTextureRenderer: Mg, LayersController: MC(...),
  // lazy
  FaceController: null, XrController: null,
  // ciclo de vida
  initialize, isInitialized, pause, resume, isPaused, stop, reconfigureSession,
  addCameraPipelineModule, addCameraPipelineModules, removeCameraPipelineModule,
  removeCameraPipelineModules, clearCameraPipelineModules,
  runPreRender, runRender, runPostRender,
  requiredPermissions, drawTexForComputeTex,
  version, featureFlags, loadChunk,
}
```

`run` é definido fora desse objeto literal (junto com `loadChunk`) porque precisa
validar `window.WebAssembly` antes de delegar ao core interno.

### `XR8.run(config)`

Assinatura real — **um único objeto**, não argumentos posicionais (`xr.js` char
~827100, dentro de `const r={run:(...)=>{...}}`):

```js
run: ({
  canvas: A,
  verbose: g = false,
  render: I = true,
  webgl2: e = true,
  ownRunLoop: Q = true,
  allowFront: B = false,
  cameraConfig: i = null,
  glContextConfig: E = null,
  allowedDevices: o = null,
  sessionConfiguration: r = {},
}) => {
  try {
    if (!window.WebAssembly) throw new Error("WebAssembly is not supported by this device's browser");
    Object.assign(C, { verbose: g, render: I, webgl2: e, ownRunLoop: Q, allowFront: B,
                        cameraConfig: i, glContextConfig: E, allowedDevices: o,
                        paused: false, sessionConfiguration: r });
    t.run(A, C); // t = engine core interno
  } catch (A) { t.onError(A); }
}
```

- `canvas` é obrigatório, os outros 9 têm default.
- `allowedDevices` tem default literal `null` no parâmetro, mas é resolvido depois: em
  `XrDevice`, `i=A=>A&&A.allowedDevices?A.allowedDevices:B().device().MOBILE_AND_HEADSETS`
  (`xr.js` char ~768700) — ou seja, `null` vira efetivamente
  `XrConfig.device().MOBILE_AND_HEADSETS` mais adiante no pipeline de compatibilidade.
- Erros de inicialização (inclusive falta de WebAssembly) vão para `t.onError`, não para
  uma Promise rejeitada — se você espera `.catch()` em `XR8.run()`, não tem.

### `XR8.stop()`

`xr.js` char 827568, dentro do objeto retornado pelo engine core:

```js
stop: () => {
  n && n.stop();              // para o device/sessão nativa
  m.detach();                 // detach de todos os pipeline modules
  R.detach();                 // detach do renderer
  C && (C._c8EmAsm_resetOnPipelineStop(), /* limpa texturas GL alocadas */);
  i = false; t = false;       // isInitialized / isPaused resetados
  tA();                       // cleanup interno
  // desliga contexto WebGL, zera GL.buffers/programs/textures/... (evita vazamento)
  window.removeEventListener("orientationchange", fA);
  document.removeEventListener(Vg(), oA);
  // limpa objetos de estado (o, r), reseta fila de eventos (k, N)
}
```

`stop()` é destrutivo — desliga o contexto WebGL e zera as coleções internas do
Emscripten. Não é `pause()`.

### `XR8.pause()` / `XR8.resume()` / `XR8.isPaused()`

Existência e nomes confirmados no retorno do engine core (`pause:DA, resume:lA,
isPaused:()=>t`, mesma região de `stop`/`reconfigureSession`). Os corpos de `DA`/`lA`
não foram minerados nesta sessão — o que se sabe com confiança vem de uso cruzado:
`reconfigureSession` chama `R.pause()`/`R.resume()` (não `DA`/`lA` diretamente, então
`R` parece ser o alvo real de pause/resume no nível de renderer) e checa `if(t)throw...
"Cannot reinitialize session while paused"` antes de reconfigurar. A doc (via WebFetch,
`8thwall.org/docs/api/engine/xr8`) descreve `pause()` como "Pauses the current session
without closing resources" e `resume()` como "Resumes a paused XR session" — consistente
com `stop()` sendo destrutivo e `pause()`/`resume()` não.

### `XR8.reconfigureSession(config)`

**Não está na doc** — `https://8thwall.org/docs/api/engine/xr8/reconfiguresession`
devolve 404, e a página-índice de `XR8` (`8thwall.org/docs/api/engine/xr8`, via
WebFetch) lista `run/stop/pause/resume/isPaused/initialize/isInitialized/version/
addCameraPipelineModule(s)/removeCameraPipelineModule(s)/clearCameraPipelineModules/
runPreRender/runPostRender/requiredPermissions` — sem `reconfigureSession` e **sem
`runRender`** (existe no bundle, ausente do índice da doc).

Sequência real (`xr.js` char 828179):

```js
reconfigureSession: (g) => __awaiter(this, void 0, void 0, function* () {
  if (!i) throw new Error("[XR8] Cannot reinitialize session at this time.");
  if (t) throw new Error("[XR8] Cannot reinitialize session while paused.");
  m.detach();                    // 1. detach de todos os pipeline modules
  R.pause();                     // 2. pausa o renderer
  i = false;                     // 3. marca "não inicializado"
  tA();                          // 4. cleanup interno
  n.stop(); n = null;            // 5. para e descarta a sessão nativa
  Object.assign(I, g);           // 6. funde o config novo no config interno (I)
  uA({ config: b() });           // 7. reaplica config resolvido
  try {
    const A = nA();
    (yield sA(A)) || (R.resume(), m.attach(), i = true, tA()); // 8. reinicializa
  } catch (A) { J(A); }          // erro vai para o handler global
  finally { sg(false); }
})
```

Detach → pause → stop da sessão nativa → merge do config → reinicialização — confirma
exatamente o padrão descrito em `packages/xrextras/src/sessionreconfiguremodule/
session-reconfigure-module.ts`, que é o único consumidor real encontrado:

```ts
const restartSessionWith3dFallback = () => {
  XR8.reconfigureSession({ ...runConfig, sessionInitBehavior: 'fallback' })
}
const enableAnyDirection = () => {
  XR8.reconfigureSession({ ...runConfig, cameraConfig: { ...runConfig.cameraConfig, direction: 'any' } })
}
const disableVoidSpace = () => {
  XR8.reconfigureSession({ ...runConfig, sessionConfiguration: { ...runConfig.sessionConfiguration,
    defaultEnvironment: { ...runConfig.sessionConfiguration?.defaultEnvironment, disabled: true } } })
}
```

Esse arquivo também guarda `runConfig` a partir do callback `onRunConfigure` do próprio
pipeline module — evidência de uso real de um callback que também não está na doc (ver
tabela de divergências).

### Gerenciamento de pipeline modules

`XR8.addCameraPipelineModule(module)` — `xr.js` char 826419, variável interna `SA`:

```js
SA = (A) => {
  if (!A.name || typeof A.name !== "string" || A.name === "")
    throw new Error("module.name must be a non-empty string");
  if (u.has(A.name))
    return void console.warn(`[XR] Camera Pipeline Module named ${A.name} was already added; skipping.`);
  if (i && A.onBeforeSessionInitialize)                    // pipeline já rodando?
    try { A.onBeforeSessionInitialize(r); }
    catch (g) { return void console.error(`[xr] Failed to add module ${A.name} to pipeline: ${g}`); }
  u.add(A.name);
  const g = A.name.toLowerCase().replace(/\//g, "-");      // nome normalizado
  y.addModule(A, (A) => x(g, A));
  A.listeners && A.listeners.forEach((g) => JA({ eventName: g.event, moduleName: A.name, process: g.process }));
  p.add(A.name, A.requiredPermissions);
  R.add(A.name); m.add(A.name);
}
```

Pontos que não são óbvios a partir da doc:
- **Nome duplicado não substitui** — o segundo `addCameraPipelineModule` com o mesmo
  `name` é descartado com um `console.warn`, silenciosamente do ponto de vista de
  exceção (não lança).
- **`onBeforeSessionInitialize` pode disparar imediatamente**, síncrono, dentro do
  próprio `addCameraPipelineModule`, se o pipeline já estiver rodando (`i` truthy) —
  não espera o próximo ciclo.
- **O nome do módulo é normalizado** (`toLowerCase()` + `/` → `-`) antes de virar chave
  interna — dois módulos com nomes que só diferem em maiúscula colidem.
- `A.listeners` é registrado aqui mesmo, não em `onAttach` — ver contrato abaixo.

`removeCameraPipelineModule`/`removeCameraPipelineModules`/`clearCameraPipelineModules`
existem como espelho direto (`UA`, `MA`, e `clearCameraPipelineModules:()=>MA(Array.from(u))`
— limpar é "remover todos os nomes conhecidos", não um caminho separado).

### Contrato de um pipeline module

Lista canônica de callbacks, `xr.js` char 792441 (variável `Hg`, um array literal usado
para validar/registrar módulos):

```js
Hg = [
  "onBeforeRun", "onRunConfigure", "onBeforeSessionInitialize", "onStart",
  "onProcessGpu", "onProcessCpu", "onUpdate", "onRender",
  "onPaused", "onResume", "onException",
  "onDeviceOrientationChange", "onCanvasSizeChange", "onVideoSizeChange",
  "onCameraStatusChange", "onAppResourcesLoaded",
  "onAttach", "onSessionAttach", "onDetach", "onSessionDetach", "onRemove",
  "sessionManager",
]
```

Desses, só 4 rodam a cada frame (`xg = {onProcessGpu:true, onProcessCpu:true,
onUpdate:true, onRender:true}`, mesmo char ~792441) — todo o resto é evento de ciclo de
vida, disparado no máximo uma vez por transição de estado.

Nomes antigos, ainda aceitos com warning de depreciação (`xr-slam.js`-adjacent lookup
table `qg`, `xr.js` mesma região): `onCameraTextureReady` → renomeado para
`onProcessGpu`; `onHeapDataReady` → `onProcessCpu`; `onUpdateWithResults` → `onUpdate`.
O warning literal: `` `[XR] Module '${nome}' uses deprecated callback name. '${antigo}' has been renamed to '${novo}'. See docs.8thwall.com.` ``

Além dos callbacks fixos, um módulo pode declarar `listeners: [{event, process}]` para
assinar eventos nomeados livres (é como `reality.imagefound`, `reality.meshfound`
chegam até a integração Babylon — ver seção Babylonjs). Confirmado pelo próprio
`addCameraPipelineModule` (acima): `A.listeners.forEach(g => JA({eventName:g.event,
moduleName:A.name, process:g.process}))`.

**Cobertura da doc:** a página `8thwall.org/docs/api/engine/camerapipelinemodule` (via
WebFetch) documenta `name, onBeforeRun, onStart, onAttach, onProcessGpu, onProcessCpu,
onUpdate, onRender, onDetach, onCameraStatusChange, onDeviceOrientationChange,
onCanvasSizeChange, onVideoSizeChange, onException, onPaused, onResume,
onAppResourcesLoaded, onRemove, requiredPermissions` — 19 nomes. **Ausentes da doc e
presentes no bundle:** `onRunConfigure`, `onBeforeSessionInitialize`, `onSessionAttach`,
`onSessionDetach`, `sessionManager`, e o contrato `listeners`.

### Aliases deprecados no topo de `XR8`

Registrados via helpers internos (`PQ`/`WQ`, `xr.js` char ~1034xxx) logo depois que o
objeto principal é montado — existem só para não quebrar código antigo:

| Nome antigo | Aponta para | Nota |
|---|---|---|
| `XR8.GLRenderer` | `XR8.GlTextureRenderer.pipelineModule` | |
| `XR8.ThreejsRenderer` | `XR8.Threejs` | |
| `XR8.canvasScreenshot` | `XR8.CanvasScreenshot.canvasScreenshot` | |
| `XR8.CameraPixelArrayModule` | `XR8.CameraPixelArray.pipelineModule` | |
| `XR8.getGLctxParameters` / `setGLctxParameters` | `XR8.GlTextureRenderer.*` | |
| `XR8.isDeviceBrowserSupported` | `XR8.XrDevice.isDeviceBrowserCompatible` | |
| `XR8.FullWindowCanvas` | `XRExtras.FullWindowCanvas` | marcado "R13.1" — versão em que foi movido |
| `XR8.getCompatibility` | função interna `wg`, rotulada "XR8.XrDevice" | |
| `XR8.JSDevice` | função interna `lg`, rotulada "XR8.XrDevice" | |
| `XR8.registerAFrameXrComponent` | `AFRAME.registerComponent('xrweb', XR8.AFrame.xrwebComponent())` | |

Se aparecer código de tutorial usando qualquer nome da coluna esquerda, funciona, mas é
legado — prefira a coluna do meio.

## `XR8.XrController`

Carregado sob demanda: `XR8.loadChunk` importa `xr-slam.js`, resolve
`XrControllerFactory`, e popula `XR8.XrController` (`xr.js` char ~ dentro de
`loadChunk`, ramo `"slam"`). Antes disso `XR8.XrController` é `null` — não existe até o
chunk `slam` carregar (por isso `data-preload-chunks="slam"` no `<script>` do engine).

**A fábrica devolve 11 membros** (`xr-slam.js` char 5537581, literal de retorno da
Promise interna):

```js
return G.then(() => ({
  pipelineModule: WA,
  configure: nA,
  recenter: XA,
  hitTest: zA,
  updateCameraProjectionMatrix: xA,
  updateEnableEngineVpsEvents: vA,
  getEnableEngineVpsEvents: _A,
  getIntrinsic: $A,
  getIsDataRecording: sA,
  startDatarecorder: KA,
  stopDatarecorder: FA,
  xrController: () => ({           // acessor "legado", objeto MENOR e com nomes diferentes
    cameraPipelineModule: WA,      //   pipelineModule vira cameraPipelineModule
    configure: nA,
    recenter: XA,
    updateCameraProjectionMatrix: xA,
    updateCameraOrigin: xA,        // alias — literalmente a mesma função (xA)
  }),
}))
```

**A doc índice de `XrController`** (`8thwall.org/docs/api/engine/xrcontroller`, via
WebFetch) lista só 5: `configure, hitTest, pipelineModule, recenter,
updateCameraProjectionMatrix`. `updateEnableEngineVpsEvents`, `getEnableEngineVpsEvents`,
`getIntrinsic`, `getIsDataRecording`, `startDatarecorder`, `stopDatarecorder` e o
acessor `xrController()` não aparecem — mais da metade da superfície real não está
documentada nessa página.

`getIntrinsic`, `getIsDataRecording`, `startDatarecorder`, `stopDatarecorder` — nomes e
posição no retorno confirmados; os corpos (`$A`, `sA`, `KA`, `FA`) não foram localizados
nesta sessão de mineração (não achei as definições no mesmo trecho do arquivo — podem
estar em outra parte do IIFE). Pelo nome e pela vizinhança com `getIntrinsic`,
`startDatarecorder`/`stopDatarecorder` provavelmente controlam a gravação de sessão
usada por replay/depuração — tratar como hipótese, não como confirmado.

### `configure(config)`

Definição completa em `xr-slam.js` char 5530231 (`nA`). Toda chave aceita, com o que o
bundle faz com ela:

| Chave | Bundle diz | Restrição |
|---|---|---|
| `enableFeatureSet` / `enableWorldPoints` | mesmo flag interno (`S`) — são sinônimos | — |
| `scale` | `"absolute"` liga escala métrica; qualquer outra coisa é responsive | só antes de `XR8.run()`, senão `throw` |
| `enableLighting` | liga estimativa de luz em `processCpuResult.reality.lighting` | — |
| `leftHandedAxes` | liga eixos canhotos | — |
| `mirroredDisplay` | espelha esquerda/direita na saída | — |
| `vpsMode` | mapeia string → enum `fI.VpsMode`; default interno `DEVICE_WITH_SERVER_FALLBACK` | — |
| `enableVps` | dispara `console.error("[XR] VPS is not supported in standalone mode.")` | só antes de `XR8.run()`, senão `throw`; se junto com `scale:"absolute"`, força de volta pra responsive com warning |
| `disableWorldTracking` | desliga SLAM | só antes de `XR8.run()`, senão `throw`; incompatível com `scale:"absolute"` e com `enableVps` (ambos lançam) |
| `projectWayspots` | array de strings — nomes de wayspots publicados para localizar contra | só antes de `XR8.run()`, senão `throw`; valida que cada item é string |
| `imageTargetData` | **caminho ativo** — array com os dados reais dos alvos | se a sessão não fornecer textura de câmera, lança |
| `imageTargets` | **deprecado** — só dispara `console.warn("[XR] imageTargets is deprecated, please use imageTargetData instead.")`; se `imageTargetData` também não vier, **nada é configurado** | — |
| `mapSrcUrl` | URL de mapa pré-gerado | — |
| `localizationTargets` | lista de alvos de localização | — |
| `enableJpgEncoding` | seta formato de compressão via WASM (`_c8EmAsm_setCompressedFormat`) | — |
| `enableDataRecorder` | liga gravação de sessão via WASM (`_c8EmAsm_setEnableDataRecorder`) | — |
| `enableAreaTargets` + `areaTargets:[{name,buffer}]` | registra mapas de área (`_c8EmAsm_addAreaTargetMap` por item) | força `scale` de volta pra responsive se estava absolute |

**A doc de `configure()`** (`8thwall.org/docs/api/engine/xrcontroller/configure`, via
WebFetch) documenta só 7 chaves: `disableWorldTracking, enableLighting,
enableWorldPoints, imageTargets, leftHandedAxes, mirroredDisplay, scale` — e a própria
doc é inconsistente internamente: a assinatura mostrada usa `imageTargets: []`, mas a
tabela de parâmetros da mesma página descreve `imageTargetData`. `enableVps`, `vpsMode`,
`projectWayspots`, `enableAreaTargets`/`areaTargets`, `enableJpgEncoding`,
`enableDataRecorder`, `mapSrcUrl`, `localizationTargets` — **oito chaves — não aparecem
nessa página.**

O que isso muda na prática: se você tentou `configure({imageTargets: [...]})` seguindo
um tutorial ou exemplo mais antigo, **isso hoje é um no-op silencioso** (só um
`console.warn`) neste binário — o app precisa migrar para `imageTargetData`.

### `updateCameraProjectionMatrix({cam, origin, facing, updateRecenterPoint})`

Esta é a primitiva de declaração de origem — tudo que "ancora" conteúdo no 8th Wall
passa por aqui, direta ou indiretamente (a integração Babylon chama isso no attach, ver
seção seguinte). Definição completa, `xr-slam.js` char 5532960 (`xA`):

```js
xA = ({ cam: A, origin: I, facing: g, updateRecenterPoint: C = true }) => {
  H = true;                                    // marca "câmera configurada"
  A && Object.assign(n, A);                    // cam: merge parcial em n (não substitui)
  I && (P = { x: I.x, y: I.y, z: I.z },         // origin vira a origem "viva" (P)
        C && (p = Object.assign({}, P)));       // se updateRecenterPoint, também vira a baseline de recenter (p)
  g && (l = { w: g.w, x: g.x, y: g.y, z: g.z }, // facing vira o facing "vivo" (l)
        C && (f = Object.assign({}, l)));        // idem — baseline de recenter (f)
  a ? (P.y = 1, d = 1)                          // scale:"absolute" → força y=1 e escala=1
    : d = (J || NA) ? 1 : P.y;                  // responsive: escala = origin.y, salvo VPS/AreaTargets (escala=1)
  fA({ cam: n, origin: P, facing: l, scale: d, mapSrcUrl: x });
}
```

Defaults internos, `xr-slam.js` char 5514106 (estado inicial do mesmo closure da
fábrica — **este é o valor real usado quando você não passa `origin`/`facing`/`cam`**,
não só um valor de exemplo da doc):

```js
P = { x: 0, y: 2, z: 0 };            // origin default
l = { w: 1, x: 0, y: 0, z: 0 };      // facing default (quaternion identidade)
p = { x: 0, y: 2, z: 0 };            // recenter baseline default (mesmo valor de P)
f = { w: 1, x: 0, y: 0, z: 0 };
n = { pixelRectWidth: 0, pixelRectHeight: 0, nearClipPlane: 0.01, farClipPlane: 1000 };
```

A doc (`8thwall.org/docs/api/engine/xrcontroller/updatecameraprojectionmatrix`, via
WebFetch) **bate exatamente** com esses defaults — `origin: {x:0,y:2,z:0}`, `facing:
{w:1,x:0,y:0,z:0}`, `cam.nearClipPlane: 0.01`, `cam.farClipPlane: 1000` — boa
confirmação cruzada. Mas a assinatura documentada é `{cam, origin, facing}` — **sem
`updateRecenterPoint`**, que existe só no bundle.

Semântica de `updateRecenterPoint` (default `true`, não documentado): controla se esta
chamada **também** move o ponto para onde um `recenter()` futuro vai voltar. Ligado ao
corpo de `recenter()` abaixo — os dois são a mesma máquina de estado (`P`/`l` = valor
vivo; `p`/`f` = baseline de recenter). Passar `updateRecenterPoint: false` atualiza
origin/facing "ao vivo" sem mexer no que `recenter()` restaura depois.

`origin.y` faz dupla função em modo `scale:"responsive"` (o default): além de posição,
vira literalmente o **fator de escala** enviado ao WASM (`d = P.y`), a menos que VPS ou
Area Targets estejam ativos (aí é forçado a `1`). É por isso que o exemplo oficial do
three.js (`threejs-world-effects-example/src/threejs-scene-init.js`, linha 46) fixa
`camera.position.set(0, 2, 2)` com o comentário **"This must be at a height greater than
y=0"** — `y=0` viraria `scale=0`, degenerado. Em modo `scale:"absolute"` isso é
irrelevante: `y` é forçado a `1` e a escala também, porque a escala aí vem de métricas
reais (paralaxe), não do valor que você passou.

`cam` é merge parcial (`Object.assign(n, A)`) — passar só `{nearClipPlane: 0.1}` não
apaga `pixelRectWidth`/`pixelRectHeight` já configurados. O exemplo three.js nem passa
`cam` — só `{origin, facing}` — e funciona, porque `n` já tem defaults utilizáveis.

**Alias interno:** dentro do acessor "legado" `xrController()` (não no namespace
principal), `updateCameraOrigin` é literalmente `xA` — a mesma referência de função que
`updateCameraProjectionMatrix` (`xr-slam.js` char 5537862). Não é uma função separada
com semântica reduzida; é o mesmo código com outro nome, só alcançável por
`XR8.XrController.xrController().updateCameraOrigin(...)` em vez do caminho principal.

### `recenter()`

Sem parâmetros — nem no bundle, nem na doc. `xr-slam.js` char 5534822 (`XA`):

```js
XA = () => {
  P = Object.assign({}, p);    // origin vivo volta pra baseline de recenter
  l = Object.assign({}, f);    // facing vivo volta pra baseline de recenter
  N && (                       // se o WASM está carregado:
    N._c8EmAsm_recenter(),     //   recentraliza o tracking nativo
    J && BA?.foundFirstGeometry() && (
      EA || gA.dispatchEvent("meshlost", { id: BA.firstGeometryNodeId() }),
      BA.resetFirstGeometry()
    )
  );
  MA(gA, true);                 // notifica mudança de estado de attach
}
```

Ou seja: `recenter()` não pede um novo `origin`/`facing` — ele **restaura** o que foi
gravado como baseline pela última chamada de `updateCameraProjectionMatrix(...)` com
`updateRecenterPoint` não-`false` (ou o default `{x:0,y:2,z:0}` se `updateCameraProjectionMatrix`
nunca rodou). Doc (`8thwall.org/docs/api/engine/xrcontroller/recenter`, via WebFetch):
"Repositions the camera to the origin / facing direction specified by
`XR8.XrController.updateCameraProjectionMatrix()` and restart tracking" — consistente.

Se VPS está ativo e havia uma geometria de wayspot rastreada, `recenter()` também
dispara `meshlost` para limpar esse estado (a menos que eventos VPS estejam
suprimidos — ver seção VPS/wayspots).

**`recenterWithOrigin` não é um método de `XrController`.** A página de doc de
`recenter()` não lista essa variante como método irmão, e o bundle confirma por quê:
`recenterWithOrigin` só existe como **nome de evento de cena do A-Frame** (`xr.js` char
977756), dentro da integração `xrweb`/`AFrame`, não relacionado à Babylon:

```js
sQ(g.sceneListeners, g.aScene, "recenterWithOrigin", (A) => {
  g.aScene.emit("recenter", A.detail);
})
```

Isso escuta um evento DOM/A-Frame chamado `"recenterWithOrigin"` disparado no
`<a-scene>` e o reemite como `"recenter"` — é plumbing exclusivo do componente A-Frame,
irrelevante para quem integra via `XR8.Babylonjs`.

### `hitTest(x, y, includedTypes = [])`

`xr-slam.js` char ~5535072 (`zA`, com o enum de tipos `jA` logo antes):

```js
jA = { UNSPECIFIED: "UNSPECIFIED", FEATURE_POINT: "FEATURE_POINT",
       ESTIMATED_SURFACE: "ESTIMATED_SURFACE", DETECTED_SURFACE: "DETECTED_SURFACE" };

zA = (A, I, g = []) => {
  if (!N) return [];                 // WASM ainda não carregado → array vazio, não exceção
  // monta query flatbuffer com x=A, y=I, includedTypes=g (mapeados via jA/zI.ResultType)
  // ...chama N._c8EmAsm_query(ponteiro, tamanho)...
  return hits.map((A) => ({
    type: /* switch A.getType() → jA.FEATURE_POINT | .ESTIMATED_SURFACE | .DETECTED_SURFACE | .UNSPECIFIED */,
    position: { x: A.getPlace().getPosition().getX(), y: ..., z: ... },
    rotation: { x: ..., y: ..., z: ..., w: A.getPlace().getRotation().getW() },
    distance: A.getDistance(),
  }));
};
zA.type = jA;   // XR8.XrController.hitTest.type.{FEATURE_POINT,...} — strings, mesmo valor que o literal
```

Bate com a doc (`8thwall.org/docs/api/engine/xrcontroller/hittest`, via WebFetch):
assinatura `hitTest(X, Y, includedTypes = [])`, `(0,0)` topo-esquerda, `(1,1)`
inferior-direita, retorno `{type, position, rotation, distance}`. Único gap: a doc só
exemplifica `includedTypes` com `'FEATURE_POINT'`; o switch no bundle aceita os três
tipos de entrada (`FEATURE_POINT`, `ESTIMATED_SURFACE`, `DETECTED_SURFACE`) — a doc não
é errada, só subespecificada no exemplo.

Uma peculiaridade não documentada: no `configure()`, o mapeamento de `leftHandedAxes`
para o sistema de eixos nativo é `L ? CoordinateAxes.X_RIGHT_YUP_ZFORWARD :
CoordinateAxes.X_LEFT_YUP_ZFORWARD` (`xr-slam.js`, dentro de `fA`, região ~5528000) —
ou seja, `leftHandedAxes: true` manda o WASM usar a constante nomeada "RIGHT", e
`false` manda usar "LEFT". A relação parece invertida em relação ao nome do parâmetro;
o bundle não expõe o porquê (provavelmente compensação interna), então registro o
mapeamento literal sem inferir a causa.

`hitTest` devolve `[]` (não lança) se o módulo WASM (`N`) ainda não carregou. Isso é uma
proteção diferente de "SLAM ainda não tem pose" — o guard aqui é só "engine existe em
memória", não "engine tem uma leitura válida agora". Não foi possível, nesta sessão de
mineração de bundle, confirmar ou refutar o comportamento sob "WASM carregado mas sem
pose ainda" a partir do código-fonte (essa é uma condição de estado interno do WASM
compilado, não visível no JS wrapper).

### `updateEnableEngineVpsEvents(bool)` / `getEnableEngineVpsEvents()`

`xr-slam.js` char 5537489: `vA = (A) => { EA = !A }`, `_A = () => !EA`. O flag `EA`
começa `false` (`xr-slam.js` char 5514680, mesmo bloco de inicialização de `P`/`l`
acima) — ou seja, **por padrão os eventos NÃO estão suprimidos** (`EA=false` → toda
checagem `EA || dispatchEvent(...)` cai no `dispatchEvent`). `updateEnableEngineVpsEvents(false)`
é o que efetivamente desliga (`EA=true`), não o contrário do que o nome sugeriria à
primeira vista. Esse único flag controla, ao mesmo tempo, os eventos `mesh*` **e**
`location*` (ver seção VPS/wayspots) — não são toggles independentes.

## `XR8.Babylonjs.xrCameraBehavior`

**Antes de mais nada — o que este build NÃO tem:** `XR8.Threejs` e `XR8.CloudStudioThreejs`
expõem `{pipelineModule, xrScene, configure, ...}` (`xr.js` char 946697 e 959920 —
confirmado: `return{pipelineModule:R, xrScene:m, ThreejsRenderer:..., configure:...}`), o
que é o padrão "registre pipeline modules, chame `XR8.run()` você mesmo, pegue
`{scene,camera}` de volta em `onStart` via `XR8.Threejs.xrScene()`" — é literalmente o
que `threejs-world-effects-example` faz. **`XR8.Babylonjs` não tem `pipelineModule()` nem
`xrScene()`.** A fábrica inteira (`xr.js` char 990235, `function mQ()`) só devolve:

```js
return { xrCameraBehavior: (A, g) => w(A, g, kQ), faceCameraBehavior: (A, g) => w(A, g, RQ) }
```

Confirmado por busca negativa no arquivo inteiro: zero ocorrências de
`"Babylonjs.xrScene"` ou `"Babylonjs.pipelineModule"` em `xr.js`. Se algum
tutorial/exemplo mostra `XR8.Babylonjs.pipelineModule()` ou `XR8.Babylonjs.xrScene()`,
ele **não roda neste binário** — só o padrão Behavior existe. É provável que essa seja a
"abordagem que está sendo abandonada" mencionada no README da skill: qualquer código
escrito contra o padrão pipeline-module+xrScene para Babylon precisa migrar para
Behavior.

### O padrão real: `camera.addBehavior(...)`

`xrCameraBehavior(config, xrConfig)` e `faceCameraBehavior(config, xrConfig)` são a
**mesma implementação** (`w`, `xr.js` char ~995000), parametrizada por um terceiro
argumento fixo que seleciona o modo (`kQ=0` → world tracking, `RQ=1` → face). Confirmado
também pela doc (`8thwall.org/docs/api/engine/babylonjs/xrcamerabehavior`, via
WebFetch): assinatura `xrCameraBehavior(config, xrConfig)`, descrita como retornando "a
Babylon JS behavior... attaching to a camera instance via `camera.addBehavior()`" — bate
com o bundle.

`attach(i)` — `i` é a **câmera Babylon** à qual o comportamento foi anexado
(`camera.addBehavior(XR8.Babylonjs.xrCameraBehavior(cfg, xrCfg))`). Ordem exata das
operações (`xr.js`, dentro de `w`, região ~995000-995400):

```js
attach(i) {
  C = i.getEngine();
  Q = i.getScene();
  B = i;                                                    // 1. guarda engine/scene/camera
  e = I; t = g;                                              // 2. guarda modo e xrConfig
  B.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(B.rotation); // 3. deriva quaternion do Euler atual
  Q.autoClear = false;                                       // 4. desliga autoClear da cena
  Q.onBeforeRenderObservable.add(() => {
    E && (XR8.runPreRender(Date.now()), XR8.runRender());     // 5. hook de pré-render condicional a "attached"
  });
  Q.onAfterRenderObservable.add(() => { E && XR8.runPostRender(); }); // 6. hook de pós-render
  XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), l()]); // 7. módulo de vídeo + "babylonjsrenderer"
  if (e === kQ) {                                             // 8a. modo world tracking:
    XR8.addCameraPipelineModule(XR8.XrController.pipelineModule());
    Object.assign(Q, { onXrImageLoadingObservable: new BABYLON.Observable, /* + 7 outras Observable de imagem/mesh */ });
  } else if (e === RQ) {                                      // 8b. modo face:
    XR8.addCameraPipelineModule(XR8.FaceController.pipelineModule());
    Object.assign(Q, { onFaceLoadingObservable: new BABYLON.Observable, /* + ~17 outras Observable de rosto */ });
  }
  XR8.run({ verbose: false, canvas: C.getRenderingCanvas(), ownRunLoop: false, ...A }); // 9. dispara XR8.run — o app NUNCA chama isso
}
init: () => {},
detach: () => { XR8.stop(); XR8.clearCameraPipelineModules(); }  // stop primeiro, depois limpa módulos
```

O que isso implica na prática, e que muda a arquitetura em relação ao padrão
pipeline-module:

- **`XR8.run()` é chamado por você indiretamente**, dentro de `attach()` — você não
  registra módulos e chama `XR8.run()` na mão; você cria `Engine`/`Scene`/`Camera` do
  Babylon primeiro e faz `camera.addBehavior(...)`.
- `ownRunLoop:false` e `verbose:false` **são fixos** nessa camada — o `...A` (seu
  `config`) vem depois no spread, então você pode sobrescrever qualquer chave
  (`canvas` incluso) se passar no seu objeto, mas o comportamento padrão é esse.
- `Q.autoClear = false` é definido pelo behavior — se seu código também mexe nisso em
  outro lugar, o attach do XR8 vence se rodar depois.
- `B.rotationQuaternion` é **sobrescrito** a partir de `B.rotation` (Euler) no attach —
  qualquer `rotationQuaternion` que a câmera já tivesse é descartado nesse instante.
- `detach()` é `XR8.stop()` **seguido de** `XR8.clearCameraPipelineModules()` — nessa
  ordem. `stop()` já desliga o contexto WebGL; limpar os módulos depois é só higiene de
  estado JS.

### O módulo interno `"babylonjsrenderer"`

É o que a chamada `l()` no passo 7 do attach acima registra (`xr.js` char 993745). Faz
duas coisas centrais:

**`onAttach`** — chama exatamente a dupla que a seção anterior descreveu como "a
primitiva de origem":

```js
onAttach: ({ canvasWidth: g, canvasHeight: I }) => {
  if (e === kQ) {
    XR8.XrController.configure({ leftHandedAxes: !Q.useRightHandedSystem, ...t });
    XR8.XrController.updateCameraProjectionMatrix({
      cam: { pixelRectWidth: g, pixelRectHeight: I, nearClipPlane: 0.01, farClipPlane: 1000 },
      origin: /* posição da câmera Babylon, convertida conforme useRightHandedSystem */,
      facing: /* rotationQuaternion da câmera Babylon, convertido conforme useRightHandedSystem */,
    });
  }
  // e === RQ (face): chama XR8.FaceController.configure({...t, nearClip, farClip, coordinates: {...}})
}
```

Ou seja: **o `origin`/`facing` usados não são o default `{x:0,y:2,z:0}`** — são a
posição/rotação reais da câmera Babylon no momento exato do `attach()`. `leftHandedAxes`
vem de `!scene.useRightHandedSystem` — o motor lê a lateralidade da cena, não escolhe
por você (confirma o que `ar-xr-8thwall.md` já registrava, agora com a linha exata).

**`onUpdate`** — a cada frame, lê `processCpuResult.reality` (ou `.facecontroller`),
extrai `rotation`/`position`/`intrinsics`, e:
- Se `intrinsics` mudou desde o frame anterior, reconstrói a matriz de projeção (com
  flip nos termos `[10]`/`[11]` quando `useRightHandedSystem` é `true`) e chama
  `camera.freezeProjectionMatrix(matrix)`.
- Em modo world tracking, aplica `rotation`/`position` convertidos à câmera; em modo
  face, aplica direto (posição) ou com um offset de 180° na conversão (rotação).

**`listeners`** — a ponte entre eventos nomeados (`reality.imagefound`,
`reality.meshfound`, `facecontroller.facefound`, etc.) e `BABYLON.Observable`s criadas
no attach (`onXrImageFoundObservable`, `onXrMeshFoundObservable`, ...). Caso especial:
`reality.meshfound` tem o payload remontado antes de notificar os observers, trocando
`geometry` bruta por `vertexData` já convertido pra `BABYLON.VertexData` (flip de
posições/índices se `useRightHandedSystem`, cálculo de normais via
`BABYLON.VertexData.ComputeNormals`). As outras 12 entradas em `listeners` só repassam
o `detail` do evento sem transformação de payload.

## `XR8.XrDevice` / `XR8.XrConfig`

`XrDevice` — 7 membros no retorno da fábrica (`xr.js` char 768286, `Dg`):

```js
{
  IncompatibilityReasons: { UNSPECIFIED:0, UNSUPPORTED_OS:1, UNSUPPORTED_BROWSER:2,
                             MISSING_DEVICE_ORIENTATION:3, MISSING_USER_MEDIA:4,
                             MISSING_WEB_ASSEMBLY:5 },
  deviceEstimate,           // {locale, os, osVersion, manufacturer, model, browser:{...}, type, features:{...}}
  deviceInfo,
  compatibilities,
  isDeviceBrowserCompatible,
  incompatibleReasons,      // array de IncompatibilityReasons
  incompatibleReasonDetails,
}
```

A doc (`8thwall.org/docs/api/engine/xrdevice`, via WebFetch) documenta 5 desses:
`IncompatibilityReasons, deviceEstimate, incompatibleReasons,
incompatibleReasonDetails, isDeviceBrowserCompatible`. **`deviceInfo` e
`compatibilities` não aparecem na página.**

`XrConfig` — só 2 membros (`xr.js` char ~722250, `B`), e são pequenos o bastante pra
citar por completo:

```js
B = () => ({
  camera: () => ({ FRONT: "front", BACK: "back", ANY: "any" }),
  device: () => ({ MOBILE: "mobile", MOBILE_AND_HEADSETS: "mobile-and-headsets", ANY: "any" }),
})
```

A doc confirma que `XrConfig` só tem `camera()` e `device()`, mas não lista os valores
do enum na página-índice (via WebFetch) — os valores acima vêm só do bundle.

Uso real desses dois, direto do código MIT de `packages/xrextras/src/fullwindowcanvasmodule/
full-window-canvas-module.ts`:

```ts
const isCompatibleMobile = () =>
  XR8.XrDevice.isDeviceBrowserCompatible({ allowedDevices: XR8.XrConfig.device().MOBILE }) &&
  !XR8.XrDevice.deviceEstimate().model.toLowerCase().includes('ipad')
```

## O que o binário NÃO tem

Seção explícita porque a ausência aqui é o que decide o que dá para prometer no design
de um jogo de sala.

- **Meshing de ambiente, depth, oclusão, classificação de superfície: zero ocorrências.**
  Busca por `occlusion` e `meshing` (case-insensitive) devolve **0 ocorrências** em
  `xr.js`, `xr-slam.js` e `xr-face.js`. Não existe API, não existe WASM export, não
  existe menção em comentário — não é só "não documentado", é ausente do binário.
- **`depth` aparece, mas não é o que o nome sugere.** As ~140 ocorrências combinadas em
  `xr.js`/`xr-slam.js` são quase todas `depthLimit` (guarda de recursão do parser
  Cap'n Proto, usado pra decodificar qualquer mensagem, nada a ver com sensor) ou
  `DEPTH_TEST`/`depthFunc`/`depthMask` (WebGL padrão). **Uma exceção real:**
  `xr-slam.js` char 5374428 tem `getDepthMap()`/`disownDepthMap()`/`setDepthMap()` numa
  struct chamada `RequestARKit` (schema Cap'n Proto) — ou seja, o WASM pode **pedir**
  depth nativo ao ARKit (LiDAR do iOS) como **entrada** para o próprio pipeline interno
  de tracking/VPS. Não há nenhum método em `XrController` que devolva esse dado pro
  app — é plumbing interno, não uma feature de depth exposta.
- **`hitTest` não é meshing.** Devolve um ponto por chamada (posição estimada de um
  pixel da tela), não uma malha da sala. Ver seção `hitTest` acima.
- **Os eventos `reality.mesh*` não são scan de ambiente.** São subproduto do tracking de
  wayspot/VPS — ver próxima seção. Sem VPS ativo, e sem uma sessão que de fato produza
  anchors de wayspot, esses eventos não têm o que emitir.
- **Não há anchor persistente por objeto no world tracking genérico.** A única memória
  de pose é a baseline de `recenter()` (`p`/`f`, ver `updateCameraProjectionMatrix`
  acima) — um ponto só, para a cena inteira, não por objeto. O mecanismo mais próximo de
  "anchor real" é wayspot/VPS, e esse está bloqueado em modo standalone (ver abaixo).
- **O motor do Studio (`packages/ecs`) não é uma saída de emergência.** No clone raso do
  monorepo (commit `1eec666c5273cb8c971b15584c2ce75c1e9484cc`, `git ls-tree -r HEAD
  --name-only` — comando que ignora qualquer filtro de sparse-checkout e lista o que o
  commit realmente contém), `packages/ecs/` tem só `LICENSE`, `README.md`,
  `RELEASING.md`, `package.json`, `tools/entry.js`, `tools/prepare.sh`. O `package.json`
  declara `"license": "MIT"` e descreve o pacote como "The game engine behind 8th Wall
  Studio" — mas **o código-fonte real não está no repositório público**, só o
  empacotamento. A licença MIT não ajuda se o código não está lá para ler.
- **Semantics/Sky reconhece uma classe: `"sky"`.** `xr.js` char 861277:
  `const yC = ["sky"]` — literal, ao lado da struct `FrameworkSemanticsResponse`. As
  chamadas WASM relacionadas (`_c8EmAsm_initSemanticsRenderer`,
  `_c8EmAsm_semanticsControllerRenderToCubemap`, char ~102157) reforçam isso — "render
  to cubemap" é composição de céu/ambiente para reflexo, não segmentação de parede ou
  chão. Não há segunda classe semântica em lugar nenhum dos três bundles.

## VPS / wayspots

Wayspot é o mecanismo de localização do 8th Wall contra **lugares específicos
pré-escaneados** (por servidor), não scan genérico de ambiente — e por isso não serve
para "detectar a sala onde o jogador está agora".

Schema Cap'n Proto (`xr-slam.js`, struct id `ecec8860835632c6`, char ~5419479):

```
XRWayspotAnchor { name, blob, nodeId, spaceId, latitude, longitude }
VpsConfiguration { wayspotAnchors: [XRWayspotAnchor], environment }
```

`getWayspotAnchors()` (`xr-slam.js` char 5419729, 7 ocorrências no arquivo) é onde a
resposta de detecção de wayspot é processada — e é **literalmente dentro desse
processamento** que os eventos `mesh*` nascem (`xr-slam.js` char ~5518520):

```js
if (BA.hasFirstGeometry()) {
  const Q = { position: A, rotation: g, geometry: BA.claimFirstGeometry(), id: C };
  EA || I.dispatchEvent("meshfound", Q);
} else {
  const Q = { position: A, rotation: g, id: C };
  EA || I.dispatchEvent("meshupdated", Q);
}
```

Cada wayspot anchor pode carregar uma "primeira geometria" — um blob de mesh pequeno
associado ao próprio anchor de localização, não um scan da sala. `meshlost` sai de
dentro de `recenter()` (ver seção `recenter()` acima) quando essa geometria já foi
encontrada mas o app recentraliza. Os eventos `location*`
(`locationscanning`/`locationfound`/`locationlost`) vivem exatamente no mesmo trecho de
código, atrás do mesmo flag de supressão `EA` — `updateEnableEngineVpsEvents(false)`
desliga os dois grupos juntos, não um de cada vez.

**O motivo central para não construir em cima disso: VPS não é suportado neste modo de
distribuição.** `xr-slam.js` char 5530901, dentro de `configure()`, tratando
`enableVps: true`:

```js
A.enableVps && console.error("[XR] VPS is not supported in standalone mode.");
```

"Standalone" aqui é o binário self-hosted (`@8thwall/engine-binary`, o que este projeto
usa) — como oposto a rodar dentro do 8th Wall Studio/hospedado. O código não lança
exceção (é um `console.error`, a execução continua), mas a mensagem é direta: a
localização geral por VPS não funciona fora do produto hospedado. `projectWayspots`
(configurar uma lista de nomes de wayspots publicados para tentar localizar contra) não
tem essa mesma guarda explícita no trecho lido — mas se o back-end de localização exige
conta/projeto Studio para responder, isso é um comportamento de servidor que não dá pra
confirmar só lendo o bundle cliente; **não testado nesta sessão**.

Consequência prática: os eventos `mesh*`/`location*` existem no binário e têm uma API
completa (schema, toggle, integração com Babylon Observables), mas **a única fonte que
os alimentaria em condições normais (localização VPS ativa) está bloqueada no modo que
este projeto usa.** Não é um caminho para "escanear a sala" mesmo se estivesse
disponível — é localização contra um lugar específico já catalogado, não descoberta de
geometria nova.

## `xrextras` — o que é MIT e reaproveitável

Pacote `@8thwall/xrextras`, `"license": "MIT"` confirmado em
`packages/xrextras/package.json`. Lista canônica de módulos vem do próprio índice do
pacote, `packages/xrextras/src/xrextras.js` — cada chave do objeto `XRExtras` exportado:

| Módulo | O que faz | Fonte |
|---|---|---|
| `AFrame` | Bindings de componentes A-Frame (`xrweb`, `xrface`, `xrlayers`, ...) — irrelevante para integração Babylon | `src/aframe/` |
| `AlmostThere` | Tela de "seu navegador não suporta AR" com fallback pra Chrome/Safari (ícones inclusos) | `src/almosttheremodule/` |
| `DebugWebViews` | `enableLogToScreen()` — redireciona `console.log/warn/error` pra uma `<div>` na tela; único jeito prático de depurar em WebView embutida (Instagram/Facebook in-app browser) | `src/debugwebviews/debug-web-views.js` |
| `FullWindowCanvas` | Redimensiona o canvas da câmera pra preencher a tela, com lógica de espera por `orientationchange` em mobile | `src/fullwindowcanvasmodule/full-window-canvas-module.ts` |
| `Lifecycle` | Registra um pipeline module (`onAttach`/`onDetach`) e expõe `add(callback)`/`remove(callback)` pra assinar o ciclo de attach sem lidar com pipeline modules diretamente | `src/lifecyclemodule/lifecycle.js` |
| `Loading` | Tela de carregamento/permissão de câmera padrão | `src/loadingmodule/` |
| `PauseOnBlur` | **Deprecado em R17.0** — pausa `XR8` em `window.blur`/retoma em `focus`. Mantido via `setRenameDeprecation`, que emite warning na primeira leitura | `src/pauseonblurmodule/pauseonblur.js` |
| `PauseOnHidden` | Substituto de `PauseOnBlur` — usa `document.visibilitychange` em vez de `blur`/`focus` (funciona melhor pra manter câmera/áudio do `MediaRecorder` ligados com a aba sem foco mas visível) | `src/pauseonhiddenmodule/pauseonhidden.js` |
| `PlayCanvas` | Glue específico de PlayCanvas — irrelevante para Babylon | `src/playcanvas/` |
| `PwaInstaller` | Prompt de "adicionar à tela inicial" | `src/pwainstallermodule/` |
| `RuntimeError` | Tela de erro padrão do engine | `src/runtimeerrormodule/` |
| `Stats` | Overlay de FPS/performance (stats.js do mrdoob, vendorizado) | `src/statsmodule/` |
| `ThreeExtras` | Glue específico de three.js — irrelevante para Babylon | `src/three/` |
| `MediaRecorder` | Gravação de foto/vídeo da sessão + UI de preview/compartilhamento/watermark | `src/mediarecorder/` |
| `SessionReconfigure` | Wrapper de UI em cima de `XR8.reconfigureSession` — os únicos exemplos reais de uso desse método encontrados nesta mineração | `src/sessionreconfiguremodule/session-reconfigure-module.ts` |

Para Babylon, os candidatos a reaproveitar diretamente são `FullWindowCanvas`,
`Loading`, `RuntimeError`, `PauseOnHidden`, `Lifecycle`, `AlmostThere`, `Stats`,
`MediaRecorder` — todos independentes de engine de render (mexem em DOM/canvas/pipeline
modules, não em objetos de cena). `AFrame`, `PlayCanvas`, `ThreeExtras` são
engine-específicos de outros frameworks e não se aplicam.

## Divergências entre doc e bundle

| Onde | Doc diz | Bundle mostra | O que verifiquei |
|---|---|---|---|
| `XR8.run()` | Assinatura com **argumentos posicionais**: `run(canvas, webgl2, ownRunLoop, cameraConfig, glContextConfig, allowedDevices, sessionConfiguration)` (via WebFetch) | **Um único objeto** desestruturado: `run({canvas, verbose, render, webgl2, ownRunLoop, allowFront, cameraConfig, glContextConfig, allowedDevices, sessionConfiguration})` | Bundle lido char a char (`xr.js` ~827100); forma de objeto confirmada por **todo** exemplo real encontrado (Babylon behavior, three.js oficial). Suspeito que a versão posicional seja artefato da camada de resumo do WebFetch, não da doc de fato — registrado com essa ressalva. |
| Índice de `XR8` | Lista `run/stop/pause/resume/isPaused/initialize/isInitialized/version/addCameraPipelineModule(s)/removeCameraPipelineModule(s)/clearCameraPipelineModules/runPreRender/runPostRender/requiredPermissions` + namespaces | Bundle tem também `reconfigureSession`, `runRender`, `loadChunk`, `featureFlags`, `drawTexForComputeTex`, `Vps`, `Sumerian`, `CloudStudioThreejs`, `Platform`, `YuvPixelsArray`, `CameraPixelArray` | Página-índice via WebFetch; membros extras confirmados no literal de retorno do objeto `XR8` |
| `XR8.reconfigureSession` | Página dedicada devolve **404** | Existe, com sequência completa (detach→pause→stop→merge config→reinit) | `xr.js` char 828179; consumidor real em `packages/xrextras` |
| Contrato de Camera Pipeline Module | 19 callbacks documentados | 22 nomes no bundle (`Hg`) | Faltam na doc: `onRunConfigure`, `onBeforeSessionInitialize`, `onSessionAttach`, `onSessionDetach`, `sessionManager`, contrato `listeners:[{event,process}]` |
| `XrController` (índice) | 5 métodos: `configure, hitTest, pipelineModule, recenter, updateCameraProjectionMatrix` | 11 membros no retorno da fábrica | Faltam: `updateEnableEngineVpsEvents`, `getEnableEngineVpsEvents`, `getIntrinsic`, `getIsDataRecording`, `startDatarecorder`, `stopDatarecorder`, `xrController()` |
| `XrController.configure()` | 7 chaves; a própria doc mistura `imageTargets` (na assinatura) com `imageTargetData` (na tabela) | ~15 chaves; bundle mostra `imageTargets` deprecado/no-op, `imageTargetData` é o caminho ativo | Doc via WebFetch, inconsistente internamente; bundle char 5531826 resolve a ambiguidade a favor de `imageTargetData` |
| `updateCameraProjectionMatrix()` | Assinatura `{cam, origin, facing}`; defaults batem exatamente com o bundle | Tem um 4º parâmetro, `updateRecenterPoint` (default `true`), que controla se a chamada também move a baseline de `recenter()` | Doc via WebFetch não menciona; bundle char 5532960 |
| `recenter()` | Sem parâmetros; nenhuma variante `recenterWithOrigin` listada como método | Confirma: sem parâmetros; `recenterWithOrigin` existe só como nome de evento de cena do A-Frame, não como método de `XrController` | Doc via WebFetch + busca negativa no bundle (`xr.js` char 977756, achado, mas fora do namespace `XrController`) |
| `XR8.Babylonjs.xrCameraBehavior` config | `webgl2` default `false` (via WebFetch) | Behavior não define `webgl2` — herda o default de `XR8.run()`, que é `true`; só `verbose:false` e `ownRunLoop:false` são de fato hardcoded pelo behavior | `ownRunLoop:false` bate exatamente entre doc e bundle; `webgl2:false` não tem base no código lido — tratado como possível ruído do resumo do WebFetch |
| `XR8.Babylonjs` | Doc (`xrCameraBehavior`) não menciona `pipelineModule()`/`xrScene()` para Babylon | Bundle confirma: esses dois métodos **não existem** em `XR8.Babylonjs` (existem em `XR8.Threejs`/`XR8.CloudStudioThreejs`) | Busca negativa de string inteira no arquivo — 0 ocorrências de `"Babylonjs.xrScene"`/`"Babylonjs.pipelineModule"` |
| `XrDevice` | 5 membros documentados | 7 no bundle | Faltam `deviceInfo`, `compatibilities` |
