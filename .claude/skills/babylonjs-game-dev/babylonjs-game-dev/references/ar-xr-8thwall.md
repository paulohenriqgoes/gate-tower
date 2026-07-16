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
