# Sistemas de Gameplay — Assets, Física, Câmera, Input, Áudio

## Carregando modelos 3D (glTF/GLB)

glTF/GLB é o formato recomendado pelo próprio Babylon.js — é o que a maioria dos exportadores (Blender, etc.) produz de forma mais confiável, e tem o melhor suporte de features (skins, animações, PBR) no engine.

Registre os loaders dinamicamente (baixa só o loader do formato realmente usado, em vez de embutir todos no bundle principal):

```ts
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
registerBuiltInLoaders();
```

Para carregar um modelo **sem** adicioná-lo direto à cena (útil quando você quer instanciar várias cópias, ou pré-carregar antes de decidir onde/quando usar), use `AssetContainer`:

```ts
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

const container = await LoadAssetContainerAsync("/assets/models/hero.glb", scene);
container.addAllToScene(); // quando decidir mostrar
// container.removeAllFromScene(); // e para tirar de cena sem perder a referência
```

Isso evita o padrão comum de recarregar o mesmo arquivo do zero toda vez que uma entidade daquele tipo é criada (ex.: spawn de vários inimigos iguais) — carregue uma vez, clone/instancie a partir do container.

Pontos de atenção comuns:
- Modelos glTF vêm com faces trianguladas — se o polycount parecer maior do que no software de origem, é esperado; para ter controle sobre isso, triangule antes de exportar.
- Erros de `GLTFLoader not registered` ou `404` geralmente são: loader não registrado antes do primeiro load, ou caminho relativo incorreto/CORS — confira que o arquivo está em `public/` e o caminho bate com o servido pelo Vite.

## Física (Havok)

Havok é o motor de física oficial do Babylon.js (WebAssembly, mesma qualidade usada em jogos de console/PC). Antes de usá-lo, confirme que o jogo realmente precisa de simulação física completa (corpos rígidos, colisões complexas, ragdoll) — para colisão simples de personagem contra cenário, o sistema de colisão embutido da câmera/mesh costuma bastar e é bem mais leve.

```ts
import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const havokInstance = await HavokPhysics();
const physicsPlugin = new HavokPlugin(true, havokInstance);
scene.enablePhysics(new Vector3(0, -9.81, 0), physicsPlugin);

// corpo estático (mass 0) para o chão
new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

// corpo dinâmico para um objeto que cai/colide
new PhysicsAggregate(crate, PhysicsShapeType.BOX, { mass: 1, friction: 0.5 }, scene);
```

Boas práticas específicas de física:
- **Use a forma de colisão mais simples que funcione** (box, sphere, capsule) em vez de `MESH` (convex hull da geometria real) sempre que possível — é a otimização de física mais impactante e barata de aplicar.
- Para movimentação de personagem jogável, prefira o **character controller** do Havok (cápsula + detecção de chão/slope embutida) em vez de aplicar forças manualmente em um corpo dinâmico — evita bugs sutis de "escorregar" ou ser empurrado por objetos leves.
- Corpos fora do campo de visão da câmera, ou muito distantes do jogador, podem ter a simulação pausada/throttled — não há motivo para gastar CPU simulando física que o jogador não vai ver.

## Câmeras

Duas escolhas cobrem a maioria dos jogos:
- `ArcRotateCamera` — câmera orbital ao redor de um alvo (ótima para jogos de terceira pessoa, RTS, showcases de objeto).
- `FreeCamera` / `UniversalCamera` — câmera livre em primeira pessoa, com `applyGravity` e `checkCollisions` habilitáveis para movimentação tipo FPS sem precisar de motor de física completo.

```ts
camera.applyGravity = true;
camera.checkCollisions = true;
camera.ellipsoid = new Vector3(0.5, 1, 0.5); // "cápsula" de colisão do jogador
scene.collisionsEnabled = true;
```

Isso resolve "não deixar o jogador atravessar paredes" sem precisar do Havok — vale considerar antes de puxar um motor de física inteiro só por causa de colisão de movimentação.

## Input do jogador

Registre input via `scene.onKeyboardObservable` / `scene.onPointerObservable` em vez de listeners de DOM soltos (`window.addEventListener`) espalhados pelo código — isso mantém o input escopado à cena atual e evita que input do menu continue ativo durante o gameplay (ou vice-versa) depois de uma troca de estado.

```ts
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";

const pressedKeys = new Set<string>();

scene.onKeyboardObservable.add((kbInfo) => {
  if (kbInfo.type === KeyboardEventTypes.KEYDOWN) pressedKeys.add(kbInfo.event.key);
  if (kbInfo.type === KeyboardEventTypes.KEYUP) pressedKeys.delete(kbInfo.event.key);
});
```

Como cada `GameState` tem sua própria `Scene` (ver `architecture.md`), esses observables são automaticamente limpos quando `scene.dispose()` é chamado na troca de estado — mais um motivo para não usar listeners globais de `window`/`document` para input de gameplay.

## Áudio

Use a `Sound`/`AudioEngine` do próprio Babylon.js (em vez de `<audio>` HTML cru) para que sons fiquem posicionados espacialmente na cena quando fizer sentido (ex.: som de um inimigo se aproximando) e sejam automaticamente descartados junto com a cena:

```ts
import { CreateSoundAsync } from "@babylonjs/core/Audio/soundHelper";

const music = await CreateSoundAsync("theme", "/assets/audio/theme.mp3", scene, { loop: true, autoplay: true });
```

Navegadores bloqueiam autoplay de áudio antes de uma interação do usuário — trate isso no estado de menu/loading (ex.: iniciar música no primeiro clique) em vez de tentar tocar automaticamente no carregamento da página.

## GUI (HUD, menus)

`@babylonjs/gui` oferece dois modos: **fullscreen 2D** (`AdvancedDynamicTexture.CreateFullscreenUI`) para HUD e menus tradicionais, e **GUI 3D** (ancorada a uma mesh no mundo) para displays diegéticos (ex.: um placar dentro da cena 3D). Para HUD comum (vida, munição, menu de pause), fullscreen 2D é mais simples e suficiente na maioria dos casos.

### Armadilhas do GUI 2D que só aparecem no device

- **`width`/`height` aceitam apenas `px` e `%`.** Qualquer outra unidade é engolida **em silêncio**: o regex de `ValueAndUnit` casa string vazia contra, digamos, `"auto"`, `parseFloat("")` devolve `NaN`, e o controle simplesmente não renderiza. Não lança, não avisa no console, e o `tsc` não pega porque a propriedade é tipada como `string`. Um HUD inteiro pode sumir por causa de uma linha assim, com build verde e a suíte passando — vale um teste que varra o código-fonte da UI atrás de literais inválidos.
- **`idealWidth`/`idealHeight` mudam a escala física de tudo.** Com `useSmallestIdeal`, o Babylon divide pela largura em retrato e pela altura em paisagem. Num celular retrato com `idealWidth = 720`, 1 px do espaço ideal vale ~0,54 px CSS — ou seja, **todo valor em px que você escreve encolhe quase pela metade na tela real**. As consequências práticas: um alvo de toque precisa de ~82 px no espaço ideal para chegar aos 44 px CSS recomendados, e um texto sem `fontSize` explícito facilmente vira ilegível. Não confie em como parece no desktop.
- **Controles que aparecem e não respondem: suspeite do TAMANHO, não da câmera.** O `AdvancedDynamicTexture` fullscreen converte o toque com `x * textureSize.width / engine.getRenderWidth()`, e o `textureSize` só é recalculado quando `engine.onResizeObservable` dispara — o que, por sua vez, **só acontece se alguém chamar `engine.resize()`**. Se o canvas muda de tamanho sem passar por lá (entrar/sair de tela cheia, um app que pula o resize durante AR — ver `ar-xr-8thwall.md`), a textura fica com o tamanho velho e o toque cai fora do alvo. O erro cresce conforme se desce na tela, então **os controles do rodapé param de responder primeiro**, o que dá a impressão enganosa de que só alguns estão quebrados.

  Verifique também `scene.cameraToUseForPointers`, mas **saiba que ele raramente é a causa**: o Babylon faz fallback em `scene.activeCamera`, então trocar a câmera em runtime (entrar em AR, alternar modos) normalmente não quebra nada por si só. Este item já apontou a câmera como causa provável e mandou duas investigações para o lado errado — a causa verificada era o descompasso de tamanho.

  Diagnóstico que separa os dois em um olhar: jogue na tela (`?debug=1` ou equivalente) `canvas.clientWidth/clientHeight`, `engine.getRenderWidth()/getRenderHeight()`, `getHardwareScalingLevel()` e `advancedTexture.getSize()`. Se `clientHeight !== getRenderHeight() * hardwareScalingLevel`, é tamanho.

  Um detalhe de painel de debug que vale junto: com `textWrapping = false` e `resizeToFit = true`, **a linha mais larga define a largura do container**. Um único campo comprido (um `Object.keys(...).join(",")`, por exemplo) empurra todo o resto para fora da tela e esconde justamente os números que você foi ler. Trunque os valores.

### Texto no mundo 3D (placas, rótulos, tags diegéticas)

- **Em AR, legibilidade se calcula em PIXELS DE TELA, não em ângulo visual.** A tentação é dimensionar a letra pela acuidade do olho (~1 arcmin) — correto para uma placa real, errado aqui: o jogador não olha o objeto, olha um **feed de câmera renderizado numa tela de celular**. O limite é quantos pixels a letra ocupa depois de passar pela câmera, e uma letra pode subtender ângulo de sobra para o olho e ainda virar três pixels borrados no feed. O modelo prático: FOV vertical da traseira ~60°, altura útil em retrato ~900 px CSS → **~15 px CSS por grau**; adote **10 px CSS** de altura de letra como piso (o dobro do que se exigiria de texto nítido, porque feed de câmera tem ruído e borra). Daí sai a altura física: `altura = distância × tan(altura_em_px / 15°)`. Errar esse modelo é caro nos dois sentidos — dimensionar por ângulo visual produziu, num caso real, uma placa ~8× maior que o pretendido, legível do outro lado da sala quando o design pedia que só fosse legível de perto.
- **`DynamicTexture.update(false)` sobe a imagem de cabeça para baixo.** O canvas 2D tem origem em cima à esquerda; a textura WebGL, embaixo à esquerda. O parâmetro é `invertY` e o padrão (`true`) é o que reconcilia os dois — passe `update()`, não `update(false)`. A armadilha é que isso **passa despercebido em textura simétrica**: um xadrez ou um gradiente radial ficam idênticos virados, então o `false` sobrevive no código por meses e só aparece quando alguém desenha o primeiro texto.
