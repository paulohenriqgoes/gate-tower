# Performance — Otimizando um Jogo Babylon.js

A regra geral: **meça antes de otimizar**. Mantenha um contador de FPS visível durante o desenvolvimento e use o Inspector (`scene.debugLayer.show()`) para ver contagem de draw calls, vértices ativos e tempo de frame. Otimizações abaixo valem a pena quando resolvem um gargalo medido — aplicá-las preventivamente em uma cena que já roda a 60fps é esforço sem retorno.

```ts
// Contador simples de FPS, sem custo relevante
engine.runRenderLoop(() => {
  scene.render();
  console.log(engine.getFps().toFixed());
});
```

Teste sempre com a câmera se movendo e interagindo, não parada — uma cena pode rodar bem com a câmera estática e cair muito quando o jogador se move e mais objetos entram no frustum.

## Draw calls: instancing e thin instances

O gargalo mais comum em jogos com muitos objetos repetidos (árvores, inimigos, projéteis, blocos) é o número de draw calls, não o polycount total. Três níveis, do mais simples ao mais performático:

1. **Sem instancing** — cada mesh é um draw call próprio. Aceitável até algumas centenas de objetos.
2. **`mesh.createInstance()`** — instâncias compartilham geometria e material com a mesh original, reduzindo draw calls drasticamente. Cada instância ainda é um objeto JS com sua própria transform e pode ter colisão própria.
   ```ts
   const instance = rootMesh.createInstance("arvore_42");
   instance.position = new Vector3(10, 0, 5);
   ```
3. **Thin instances** — para milhares de cópias (ex.: uma floresta, uma multidão), thin instances não criam objetos JS por cópia, evitando o custo de iterar milhares de `InstancedMesh` no lado do JavaScript:
   ```ts
   const matrix = Matrix.Translation(x, 0, z);
   mesh.thinInstanceAdd(matrix);
   ```
   Trade-off importante: thin instances são **tudo ou nada** na visibilidade — o engine não pode ocultar só algumas com base em frustum culling individual, então não é ideal quando as cópias estão espalhadas por uma área muito maior que a tela (nesse caso, considere dividir em grupos/tiles e usar um conjunto de thin instances por tile).

Regra prática vinda da comunidade: em uma cena com ~630 meshes ativos, instancing bem aplicado reduziu para ~73 draw calls — a diferença de FPS entre os dois cenários costuma ser de 5-10x, não incremental.

## Merge de meshes estáticas

Para geometria estática que nunca se move independentemente (partes de um cenário, terreno composto de várias peças), `Mesh.MergeMeshes` combina várias meshes em uma só, eliminando draw calls sem precisar de instancing:

```ts
const merged = Mesh.MergeMeshes([wallA, wallB, wallC], true, true, undefined, false, true);
```

Não faça isso com objetos que precisam de transform, física ou visibilidade independentes depois — merge é uma via de mão única.

## Texturas

- Use formatos comprimidos para GPU (`.basis`, `.ktx2`, ou DDS/S3TC dependendo da plataforma) em vez de PNG/JPEG cru quando o jogo tiver muitas texturas grandes — isso reduz uso de VRAM e acelera o carregamento, não só o tamanho do arquivo.
- Evite resoluções de textura maiores do que o objeto vai realmente ocupar em tela — é desperdício de VRAM comum em assets importados direto de um software de modelagem sem otimização.

## Física: throttling e formas simples

- Prefira formas de colisão simples (box, sphere, capsule) a `MESH`/convex hull sempre que a forma real do objeto não for essencial para o gameplay.
- Corpos físicos fora da visão da câmera ou muito distantes do jogador não precisam ser simulados a cada frame — considere pausar ou reduzir a frequência de simulação para eles.

## `SceneOptimizer`

O Babylon.js inclui um `SceneOptimizer` que ajusta automaticamente configurações (sombras, pós-processamento, resolução de render) em tempo real para tentar manter um FPS alvo — útil como rede de segurança para lidar com a variedade de hardware que um jogo web vai encontrar, especialmente em mobile:

```ts
import { SceneOptimizer, SceneOptimizerOptions } from "@babylonjs/core/Misc/sceneOptimizer";

const options = SceneOptimizerOptions.ModerateDegradationAllowed(60); // FPS alvo
SceneOptimizer.OptimizeAsync(scene, options);
```

## Ciclo de vida e memory leaks

- Sempre chame `dispose()` em mesh, material, textura e som que não são mais necessários (troca de fase, morte de inimigo, fim de partida). Isso deveria já estar coberto pela arquitetura de estados (ver `architecture.md`), mas vale checar objetos criados fora do ciclo normal de um `GameState` (ex.: efeitos temporários, partículas).
- `AssetContainer.dispose()` só libera o que o container efetivamente contém — cuidado ao compartilhar meshes entre containers.
- Ao usar o Inspector durante o desenvolvimento, é possível monitorar contagem de meshes/materiais/texturas ao longo do tempo para confirmar que objetos removidos da cena estão de fato sendo liberados (memory leak silencioso é comum quando algo mantém uma referência externa a uma mesh já "removida").

## Mobile e dispositivos de baixo desempenho

- Peça explicitamente a GPU de alta performance ao criar o engine (ver `project-setup.md`, `powerPreference: "high-performance"`) — em notebooks e alguns celulares com GPU dupla, o padrão pode escolher a GPU integrada mais fraca.
- Teste em hardware real de baixo/médio desempenho, não só em desktop potente — WebGL se comporta de forma bem diferente entre GPUs/drivers, e um jogo fluido no computador de desenvolvimento pode não rodar aceitável em um celular médio.
- Todas as otimizações acima (instancing, merge, texturas comprimidas, `SceneOptimizer`) importam proporcionalmente mais em mobile, onde a margem de hardware é bem menor.
