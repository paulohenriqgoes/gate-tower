# Testar gameplay de AR sem device — `NullEngine`

`NullEngine` implementa a API do engine sem WebGL, canvas ou browser: cena, meshes,
materiais, observables e o loop de frame rodam dentro do Vitest/Jest em milissegundos.

| Camada | Onde vive | Pega |
|---|---|---|
| Lógica pura (fórmulas, tabelas, máquinas de estado) | arquivo sem `import` de `@babylonjs/*`, com `.test.ts` ao lado | erro de **regra** |
| Fiação (quem escolhe alvo, quem move, quem dispara observable, quem limpa) | teste com `NullEngine` | erro de **ligação entre peças** |
| Render, tracking, input real | device | erro de **percepção**: escala, drift, legibilidade |

A camada do meio é a que costuma faltar: cada regra pura passa verde enquanto o jogo não
funciona, porque o defeito está em quem chama.

## Receita mínima

```ts
import "@babylonjs/core/Animations/animatable"; // side-effect, ver armadilha 2
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

const engine = new NullEngine();
const scene = new Scene(engine);

engine.getDeltaTime = () => 33;                          // ~30 fps determinístico
for (let frame = 0; frame < 300; frame += 1) {
  scene.onBeforeRenderObservable.notifyObservers(scene); // NÃO scene.render()
}
```

Concentre isso num único módulo de apoio que devolva
`{ engine, scene, nowMs, advanceFrames, dispose }`, em vez de repetir por teste.

## As cinco armadilhas

1. **`OffscreenCanvas` não existe em Node.** Qualquer `DynamicTexture` (barra de vida,
   blob de contato, textura procedural) explode ao ser criada. Instale um shim de
   contexto 2D antes de criar a cena — um `Proxy` que devolve no-op para todo método
   resolve, com uma exceção: `measureText()` precisa devolver `{ width: number }` de
   verdade, senão vira `NaN` silencioso.
2. **Imports granulares não trazem os side-effect modules.** `scene.beginDirectAnimation`
   só existe depois de `import "@babylonjs/core/Animations/animatable"`. O erro estoura
   dentro de um `setTimeout` de animação, fora do `it`, e o runner reporta "unhandled
   error" sem apontar o teste. Vale igual para física, loaders e GUI.
3. **`scene.render()` exige câmera** e não é o que você quer. O que move o jogo é
   `onBeforeRenderObservable` — notifique-o direto e o teste fica independente de câmera,
   viewport e pipeline de render. Em AR isso é essencial: a câmera é do XR8 e não existe
   no headless.
4. **Dois relógios.** Movimento vem de `engine.getDeltaTime()`; cooldown/timer costuma
   vir de `performance.now()`. Avançar só um simula 60 s de movimento em 300 ms de
   ataque. Injete a fonte de tempo (`now?: () => number`, default
   `() => performance.now()`) em quem tem cooldown e avance os dois juntos.
5. **Não substitua `performance.now` global** para resolver (4). O Vitest mede o timeout
   de teste nesse mesmo relógio: simular 60 s faz o runner declarar timeout de 5 s num
   teste que levou 300 ms. Injeção resolve; monkey-patch global quebra o runner.

`Logger.LogLevels = Logger.NoneLogLevel` cala o banner do Babylon, que senão aparece uma
vez por cena no relatório.

## O que testar aqui

Bons candidatos, porque só existem com as peças ligadas:

- aquisição de alvo (a entidade mira o objeto certo);
- navegação (chega, para na distância certa, não atravessa o alvo);
- observables disparando **uma** vez por evento;
- `reset()` de segunda partida deixando o campo limpo;
- vazamento de observer: contar observadores antes e depois de `dispose()`;
- matemática de transform local→mundo sob o nó âncora, e o **sinal do yaw** com
  `useRightHandedSystem = true`.

Não force para cá o que é melhor puro (fórmula, tabela) nem o que só o device responde
(escala percebida, drift de SLAM, legibilidade no feed). Um teste headless que afirma
coisa de percepção mente com confiança.
