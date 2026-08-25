---
name: babylonjs-game-dev
description: Como criar cenas de AR jogáveis com 8th Wall (XR8) + Babylon.js — engine self-hosted, pipeline modules, world tracking/SLAM, ancorar conteúdo 3D no espaço real por chão digital, image targets, hierarquia de transform, instancing, materiais e luz em mobile, ciclo de vida da sessão. Acione para qualquer pedido de AR, realidade aumentada, WebAR, world tracking, SLAM, image target, 8th Wall/8thwall/XR8, "objeto ancorado no chão", "conteúdo desliza/flutua/deriva", coaching overlay, ou integração de Babylon.js com câmera de celular. Acione também para setup de projeto (Vite+TS) e teste headless (NullEngine) quando o alvo for um jogo de AR. Não necessária para VR/headset com WebXR nativo nem para dúvidas pontuais de API do Babylon fora de AR.
---

# AR jogável com XR8 + Babylon.js

Stack: `@8thwall/engine-binary` (self-hosted) + `@babylonjs/core` + Vite/TypeScript.
Unidade do mundo é **metro**. Alvo é celular Android/iOS pelo navegador, sem app.

| Referência | Ler quando |
|---|---|
| `references/ar-drift-e-grounding.md` | O conteúdo desliza, pula, flutua ou deriva ao girar. Playbook de diagnóstico. |
| `references/8thwall-api-surface.md` | Precisa da assinatura real de um método `XR8.*`, ou o que o binário não tem. |
| `references/ui-e-texto-em-ar.md` | HUD, botões que não respondem, texto legível no feed de câmera. |
| `references/project-setup.md` | Projeto novo: Vite, tsconfig, imports, estados de jogo. |
| `references/testing-nullengine.md` | Testar gameplay sem device, no Vitest. |

## Escolha do modo de tracking

| Precisa | Use | Custo |
|---|---|---|
| Ancorar livre no espaço, andar ao redor | World tracking (SLAM) | Binário distribuído (grátis, não-MIT: exige aviso de copyright visível) |
| Ancorar num pôster/carta/playmat impresso | Image target | Pacote MIT; **tem anchor real**, não deriva |
| Filtro de rosto / céu | Face / Sky effects | Pacote MIT; desligue o SLAM |

World tracking **não tem anchor persistente por objeto** — só `recenter()`. Se
estabilidade for inegociável, use image target.

## 1. Bootstrap

**Não carregue `xr.js` por `<script>` no HTML.** Com imports granulares
(`@babylonjs/core/...`) não existe `window.BABYLON`, e o engine precisa dele **no
instante em que é carregado**: a fábrica `XR8.Babylonjs` é construída eager no load
(`Babylonjs: mQ()`) e começa com

```js
let A, g, I
window.BABYLON && (A = new BABYLON.Matrix, g = new BABYLON.Quaternion, I = new BABYLON.Vector3)
```

Sem `window.BABYLON` ali, `g` e `I` ficam `undefined` para sempre. O ramo **destro** do
conversor de quaternion usa os dois (`g.copyFrom(A)`) e estoura; o ramo canhoto não os
toca. Ou seja: **o bug fica invisível numa cena canhota e produz tela preta assim que
você liga `useRightHandedSystem`** — e você vai debitar da lateralidade, não da ordem de
carregamento.

Instale os globais e só então injete o script:

```ts
// babylonRuntimeGlobals.ts — o que o engine consome do global
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable } from "@babylonjs/core/Misc/observable";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";

export function installBabylonGlobalsForXR8(): void {
  const g = window as unknown as { BABYLON?: Record<string, unknown> };
  g.BABYLON = { Matrix, Observable, Quaternion, Vector3, VertexData, ...g.BABYLON };
}
```

```ts
function loadEngine(): Promise<void> {
  return new Promise((resolve, reject) => {
    installBabylonGlobalsForXR8();          // ANTES do script, sempre

    const tag = document.createElement("script");
    tag.src = "/external/xr/xr.js";
    tag.setAttribute("data-preload-chunks", "slam"); // "slam" | "face" | ausente (sky)
    tag.crossOrigin = "anonymous";
    window.addEventListener("xrloaded", () => resolve(), { once: true });
    tag.addEventListener("error", () => reject(new Error("falha ao carregar xr.js")));
    document.head.appendChild(tag);
  });
}
```

`data-preload-chunks` combina com vírgula (`"slam, face"`). O `index.html` fica só com o
canvas e o módulo de entrada.

**Você cria `Engine`/`Scene`/`Camera` do Babylon e anexa um behavior à câmera.** Não
registre `GlTextureRenderer`/`XrController` nem chame `XR8.run()` — o behavior faz os
três dentro do `attach()`.

```ts
const onxrloaded = () => {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);

  scene.useRightHandedSystem = true;   // LEIA o gotcha abaixo — declare sempre
  const camera = new FreeCamera("cam", Vector3.Zero(), scene);

  // Extras e módulos seus entram ANTES do attach: é o attach que dispara XR8.run().
  XR8.addCameraPipelineModules([
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
  ]);

  buildScene(scene);                    // luzes e conteúdo
  camera.addBehavior(XR8.Babylonjs.xrCameraBehavior());  // <- sobe a sessão de AR

  engine.runRenderLoop(() => scene.render());
};
window.XR8 ? onxrloaded() : window.addEventListener("xrloaded", onxrloaded);
```

- **`XR8.Babylonjs` só expõe `xrCameraBehavior()` e `faceCameraBehavior()`.** Tutoriais
  que mostram `XR8.Babylonjs.pipelineModule()` ou `XR8.Babylonjs.xrScene()` são do
  caminho three.js e **não rodam neste binário** — se encontrar código assim, migre para
  Behavior.
- O behavior fixa `ownRunLoop: false` e `verbose: false`, e define `scene.autoClear =
  false`. Ele também **sobrescreve `camera.rotationQuaternion` a partir de
  `camera.rotation`** no attach — qualquer quaternion prévio é descartado.
- `origin`/`facing` iniciais são a posição/rotação **reais da câmera no instante do
  attach**, não a origem. Posicione a câmera antes de anexar.
- HTTPS obrigatório fora de `localhost` (`ngrok http <porta>` para testar no celular).
- A permissão de câmera exige um toque do usuário: faça uma tela inicial com botão, nunca
  suba a sessão no load da página.
- **Lateralidade:** o behavior lê `scene.useRightHandedSystem` e configura o engine
  (`leftHandedAxes: !useRightHandedSystem`) — não há flip de Z a aplicar. Mas o default
  do Babylon é canhoto, e matemática de ângulo escrita na convenção destra ("frente =
  -Z, direita = +X") sai **espelhada**: virar à direita produz yaw negativo. O erro se
  cancela enquanto desenho e medição estão espelhados juntos, e só aparece quando algo
  diz "esquerda" ao jogador. Declare explicitamente e teste o sinal do yaw. **Se ligar
  isso der tela preta, o culpado é a ordem de carregamento acima, não a lateralidade.**
- Configuração do tracking vai no 2º argumento (`xrConfig`), que o behavior repassa a
  `XrController.configure()`:
  `camera.addBehavior(XR8.Babylonjs.xrCameraBehavior({}, { scale: "absolute" }))`.
- Sem ancoragem livre: `xrConfig` com `disableWorldTracking: true`.
- Image target: `imageTargetData: ["alvo-1"]` — `imageTargets` é deprecado e descartado
  com warning em runtime.
- Eventos de imagem/mesh chegam como Observables **criadas na cena pelo attach**:
  `scene.onXrImageFoundObservable`, `onXrImageUpdatedObservable`, `onXrMeshFoundObservable`…
  Só existem depois do `addBehavior`.

## 2. Ancorar um objeto no espaço real

Ordem obrigatória: **calibrar → tocar → resolver o ponto → travar**.

Resolva o ponto com um **chão digital**. Não use `hitTest` a menos que alguém
peça explicitamente — ver 2b para por quê.

### 2a. Chão digital

Uma malha grande e invisível em `y = 0`, e picking do Babylon contra ela. Sem
`hitTest`, sem fit de plano, sem estimador de altura, sem gate de colocação.

```ts
import "@babylonjs/core/Culling/ray";   // OBRIGATÓRIO — ver project-setup.md

const floor = CreateGround("floor", { width: 40, height: 40 }, scene);
floor.visibility = 0;      // NUNCA isVisible = false: isso tira a malha do picking
floor.isPickable = true;

scene.onPointerObservable.add((info) => {
  if (info.type !== PointerEventTypes.POINTERDOWN) return;
  if (tracking !== "NORMAL") return;   // escala absoluta ainda não convergiu
  const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === floor);
  if (pick?.hit && pick.pickedPoint) anchor.position.copyFrom(pick.pickedPoint);
});
```

- **`y = 0` cai no chão real de graça.** Em `scale: "absolute"` o engine descarta
  a altura que você declara e fixa `origin.y = 1 m` — o plano nasce a 1 m abaixo
  do celular no instante da colocação. Isso *deveria* errar pela diferença entre
  1 m e a altura da mão; em device (2026-08-24, Android) o erro ficou abaixo do
  limiar de percepção entre 0,4 m e 2 m, e o conteúdo assentou sem ajuste.
- **Dê um ajuste de ±5 cm no `y` do plano mesmo assim.** É um grau de liberdade,
  custa dois botões, e é a única saída quando o erro aparecer.
- **Objetos colocados em momentos diferentes ficam coerentes por construção** —
  todos saem da mesma interseção raio×plano, no mesmo referencial. A única fonte
  de erro entre eles é a deriva do SLAM acumulada entre as colocações.
- **Malha finita, não infinita.** 40 m cobre qualquer cômodo, e o tamanho finito
  evita raio quase paralelo batendo a quilômetros. Tenha um fallback aritmético
  (interseção raio×plano) para o toque que sai pela borda.
- **O que você perde:** o plano único não sabe que existe mesa — apontar para uma
  mesa põe o objeto no chão *atrás* dela. A saída é um segundo plano com altura
  ajustável, não o `hitTest`.

### 2b. `hitTest` — só sob pedido explícito

**Não escolha este caminho por conta própria.** Ele é mais caro, precisa de gate
contra crash de WASM, e na prática **quase sempre devolve `FEATURE_POINT`**, que
é um ponto solto e não uma superfície: em campo, `DETECTED_SURFACE` e
`ESTIMATED_SURFACE` aparecem tão pouco que remover `FEATURE_POINT` da lista faz o
`hitTest` emudecer por completo. Medido neste projeto: dispersão mediana de 32 cm
na nuvem (piso decente dá 2 a 5 cm), com 11 de 12 pontos passando pela rejeição
por mediana+MAD. Um gate exigindo prova positiva de superfície recusou 79 vezes e
ancorou zero.

Ou seja: você paga o custo e recebe ruído. O chão digital (2a) ancorou melhor, na
primeira tentativa, depois de três abordagens baseadas em medição terem falhado.

Use só quando alguém pedir, ou quando o produto exigir saber a **altura** de uma
superfície que não é o chão — e mesmo aí, trate o resultado como palpite.

```ts
// Gate: hitTest antes do SLAM ter pose lança "memory access out of bounds"
// no WASM e MATA o app inteiro dentro do render loop.
let tracking = "";
XR8.addCameraPipelineModule({
  name: "tracking-gate",
  onUpdate: ({ processCpuResult }: any) => {
    tracking = processCpuResult?.reality?.trackingStatus ?? "";
  },
});

canvas.addEventListener("touchstart", (e) => {
  if (tracking !== "NORMAL") return;            // LIMITED tem pose, mas instável demais
  const t = e.touches[0];
  const x = t.clientX / canvas.clientWidth;      // px CSS — NUNCA getRenderWidth()
  const y = t.clientY / canvas.clientHeight;     // (0,0) = topo-esquerdo, [0,1]
  try {
    const hits = XR8.XrController.hitTest(x, y, [
      "DETECTED_SURFACE", "ESTIMATED_SURFACE", "FEATURE_POINT", // nesta ordem
    ]);
    if (hits.length) anchor.position.set(hits[0].position.x, hits[0].position.y, hits[0].position.z);
  } catch { /* rede de segurança: nunca deixe estourar no loop */ }
});
```

- **Escala absoluta precisa de paralaxe.** Com `configure({ scale: "absolute" })` a
  escala só converge depois do jogador mover o celular para frente e para trás.
  `trackingStatus === "NORMAL"` é o sinal oficial de "calibrado" — é o mesmo critério do
  coaching overlay. Ancorar antes disso nasce com tamanho e profundidade errados, e
  contamina qualquer investigação posterior de instabilidade.
- Use `@8thwall/coaching-overlay` (MIT) como pipeline module, não escreva o seu. É DOM
  (`position: fixed`, `z-index: 412`), não GUI do Babylon. Remova com
  `removeCameraPipelineModule("coaching-overlay")` ao terminar o setup, senão ele
  reaparece por cima do jogo se o tracking degradar.
- Dê escape temporizado (~30 s preso em `LIMITED` → libera com aviso), senão o jogo
  trava para sempre numa sala de parede lisa.
- Diga ao jogador **onde apontar** antes da AR: superfície com textura e contraste, luz
  uniforme, movimento lento. O overlay cobre só a calibração de escala.
- **Não reancore a cada frame** — isso produz tremor. Ancore uma vez e ofereça um botão
  "reposicionar". Se o conteúdo desliza mesmo assim, vá para
  `references/ar-drift-e-grounding.md`.

## 3. Hierarquia: um nó raiz ancorado

Todo o conteúdo pendura num único `TransformNode`. Reposicionar a cena = mover o pai.

```ts
const anchor = new TransformNode("anchor", scene);   // único nó que toca o hitTest
const tower = MeshBuilder.CreateBox("tower", { size: 0.15 }, scene); // 15 cm reais
tower.parent = anchor;
tower.position.set(0.4, 0, -0.2);                    // metros, LOCAL ao anchor
```

- Filhos sempre em coordenadas locais; nunca escreva world position num filho.
- **Escala do conteúdo vai num filho, nunca no nó âncora.** Escalar o próprio âncora
  reescala a origem junto e desloca o ponto que você mediu com tanto custo — o conteúdo
  "escorrega" a cada ajuste de tamanho e parece drift. Ponha um nó de escala entre o
  âncora e o conteúdo: `anchor` (só posição/rotação do mundo real) → `scaler` (só
  `scaling`) → meshes.
- Escala do mundo real: uma peça de mesa é `0.05`–`0.2` m, uma pessoa `~1.7` m.
- **Toda tolerância em graus carrega um raio implícito.** 12° valem 8 cm na borda de uma
  arena de 80 cm e 47 cm num arco de 2,2 m. Ao mudar a escala do conteúdo, recalcule o
  limiar em centímetros — nunca herde o número.

## 4. Draw calls: instance vs thin instance

| Situação | Use |
|---|---|
| Até algumas centenas de cópias, cada uma com transform/pick/colisão próprios | `mesh.createInstance()` |
| Milhares de cópias, sem lógica individual | thin instances |
| Cópias espalhadas por área muito maior que a tela | thin instances **por tile** (elas são tudo-ou-nada no culling) |

```ts
const inst = root.createInstance("tile_42");
inst.position = new Vector3(1.2, 0, 0.4);

mesh.thinInstanceAdd(Matrix.Translation(x, 0, z));
```

Em AR o orçamento de frame é dividido com a decodificação da câmera e o SLAM, então isso
vale desde o protótipo, não só quando o FPS cai. **Não use `Mesh.MergeMeshes` nem
`SceneOptimizer`**: merge é via de mão única e quebra conteúdo que precisa de transform
independente; o `SceneOptimizer` degrada resolução em cima de um feed de câmera, o que
piora a percepção mais do que o FPS ganho.

## 5. Materiais e luz em mobile

```ts
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.8;
const dir = new DirectionalLight("dir", new Vector3(0.3, -1, 0.5), scene);
dir.intensity = 0.6;
```

- Uma hemisférica + uma direcional bastam. Sem shadow map, sem pós-processamento.
- Poucos materiais, compartilhados. Texturas comprimidas (`.ktx2`/`.basis`) e no tamanho
  que o objeto ocupa em tela, não no que saiu do modelador.
- **Sombra de contato = blob**: um disco com gradiente radial transparente sob cada
  entidade. Mais barato que shadow-mapping, robusto em qualquer escala, e ancora tanto
  ou mais visualmente.
- **Esconda qualquer chão virtual opaco em AR** — um grid compete com o piso real e
  denuncia o plano flutuante. Se ele era a superfície de toque, use `visibility = 0`
  (não `isVisible = false`, que remove a mesh do picking).
- **Anime a entrada** (escala 0→alvo com ease-out): mascara o snap da ancoragem.

## 6. Ciclo de vida

```ts
XR8.pause();   // congela tracking e feed; a câmera do device continua ligada
XR8.resume();

camera.removeBehavior(behavior);  // detach = XR8.stop() + clearCameraPipelineModules()
scene.dispose();
```

- Sair da AR exige **os dois**: encerrar a sessão e `scene.dispose()`. O `detach()` do
  behavior já faz `XR8.stop()` seguido de `XR8.clearCameraPipelineModules()`; guarde a
  referência do behavior para conseguir removê-lo.
- `scene.dispose()` limpa meshes, materiais, texturas e observables registrados na cena.
  O que ele **não** limpa: listeners de `window`/`document`, e nós do coaching overlay no
  `document.body`.
- Carregue modelos com `LoadAssetContainerAsync` uma vez e instancie a partir do
  container, em vez de recarregar o `.glb` por entidade.
- Áudio: navegadores bloqueiam autoplay antes de interação — use o mesmo toque que já
  concede a permissão de câmera.

## 7. Checklist de validação (device, 30–60 s)

Só o device responde isso. Coloque `trackingStatus` e FPS **na tela** — celular não tem
console acessível.

- [ ] Ancorou só depois de `NORMAL`; nada aparece antes da calibração.
- [ ] Andando ao redor por 30–60 s, a âncora não escorrega em relação ao piso real,
      **principalmente ao aproximar** (paralaxe é máxima perto).
- [ ] Parado, a âncora não dá saltos em degrau.
- [ ] Girando 360° no lugar: meça a distância câmera→âncora ao longo do tempo e registre
      os metros de deriva. Este é o pior caso e o tracking fica verde enquanto acontece.
- [ ] O conteúdo parece pousado no chão, não flutuando (blob de contato presente).
- [ ] FPS estável em iOS Safari **e** Android Chrome — a estabilidade do SLAM difere.
- [ ] O HUD ainda responde ao toque depois de entrar/sair de tela cheia.
- [ ] Uma orientação por sessão: peça landscape **antes** de subir a AR, nunca durante.
