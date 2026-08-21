# Testar jogo Babylon.js sem browser — `NullEngine`

Babylon roda headless. `NullEngine` implementa a API do engine sem WebGL, sem
canvas e sem browser, então cena, meshes, materiais, observables e o loop de
frame funcionam dentro do Vitest/Jest, em Node, em milissegundos.

Isso muda o que dá para testar num jogo. A divisão que funciona:

| Camada | Onde vive | O que ela pega |
|---|---|---|
| **Lógica pura** (regra de arena, onda, economia, curva de dano) | arquivo sem nenhum `import` de `@babylonjs/*`, com `.test.ts` ao lado | erro de **regra** |
| **Fiação** (quem escolhe alvo, quem move, quem dispara observable, quem limpa) | teste com `NullEngine` | erro de **ligação entre peças** |
| **Render, RA, input real** | device / browser | erro de **percepção**: escala, tracking, legibilidade |

A camada do meio é a que costuma faltar, e é a mais barata de perder: cada regra
pura passa verde enquanto o jogo não funciona, porque o defeito está em quem
chama. Exemplo real deste projeto: o modelo polar da arena estava correto e
testado, e mesmo assim o inimigo trocava de setor no meio do trajeto — quem
navegava ia em linha reta até a torre em vez de manter o azimute. Nenhum teste
puro pegaria isso; o teste headless pegou na primeira execução.

## Receita mínima

```ts
import "@babylonjs/core/Animations/animatable"; // efeito colateral, ver armadilha 2
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

const engine = new NullEngine();
const scene = new Scene(engine);

// ... monta o sistema sob teste ...

engine.getDeltaTime = () => 33;                       // ~30 fps determinístico
for (let frame = 0; frame < 300; frame += 1) {
  scene.onBeforeRenderObservable.notifyObservers(scene); // NÃO scene.render()
}
```

## As cinco armadilhas

1. **`OffscreenCanvas` não existe em Node.** Qualquer `DynamicTexture` (barra de
   vida, blob de contato, textura procedural) explode ao ser criada. Instale um
   shim de contexto 2D antes de criar a cena — um `Proxy` que devolve função
   no-op para todo método resolve, com uma exceção: `measureText()` precisa
   devolver `{ width: number }` de verdade, senão vira `NaN` silencioso.

2. **Imports granulares não trazem os side-effect modules.** `scene.beginDirectAnimation`
   só existe depois de `import "@babylonjs/core/Animations/animatable"`. O
   sintoma é cruel: o erro estoura dentro de um `setTimeout` de animação, fora
   do `it`, e o runner reporta "unhandled error" sem apontar o teste. A mesma
   lógica vale para física, loaders e GUI.

3. **`scene.render()` exige câmera** e não é o que você quer. O que move o jogo é
   `onBeforeRenderObservable`; notifique-o direto e o teste fica independente de
   câmera, viewport e pipeline de render.

4. **Dois relógios.** Movimento normalmente vem de `engine.getDeltaTime()`, e
   cooldown/timer costuma vir de `performance.now()`. Avançar só um faz a
   simulação andar 60 s de movimento em 300 ms de ataque — parece bug de jogo e é
   bug de teste. Solução: **injete a fonte de tempo** (`now?: () => number`, com
   default `() => performance.now()`) em quem tem cooldown, e avance os dois
   juntos.

5. **Não substitua `performance.now` global** para resolver (4). O Vitest mede o
   timeout de teste nesse mesmo relógio: simular 60 s de partida faz o runner
   declarar timeout de 5 s num teste que levou 300 ms de verdade. Injeção
   resolve; monkey-patch global quebra o runner.

Bônus: `Logger.LogLevels = Logger.NoneLogLevel` cala o banner do Babylon, que
senão aparece uma vez por cena no relatório.

## Um helper compartilhado, não cópia por teste

As cinco armadilhas acima são as mesmas em todo teste. Vale um único módulo de
apoio que devolve `{ engine, scene, nowMs, advanceFrames, dispose }` — no Tower
Gate é `src/testing/nullEngineScene.ts`. Isso mantém os testes legíveis (eles
falam de jogo, não de setup) e concentra o conhecimento de headless num lugar só.

## O que testar aqui, e o que não

Bons candidatos, porque só existem com as peças ligadas:

- aquisição de alvo (inimigo mira a torre certa, tropa mira unidade e não torre);
- navegação (chega, para na distância certa, não atravessa o alvo);
- observables de jogo disparando **uma** vez por evento (morte, fim de partida);
- `reset()` de segunda partida deixando o campo limpo e a vida cheia;
- vazamento de observer: contar observadores antes e depois de `dispose()`.

Não force para cá o que é melhor puro (fórmula, tabela, máquina de estado sem
cena) nem o que só o device responde (escala percebida, drift de SLAM,
legibilidade). Um teste headless que afirma coisa de percepção mente com
confiança.
