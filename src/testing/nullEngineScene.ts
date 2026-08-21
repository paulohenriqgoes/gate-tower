/**
 * Cena headless para teste: `NullEngine` do Babylon rodando dentro do Vitest,
 * sem WebGL, sem canvas e sem browser.
 *
 * **Para que serve.** A logica pura (arco, ondas, aproximacao radial) continua
 * nascendo em arquivo sem Babylon, com teste ao lado — isso nao mudou. O que
 * esta camada cobre e o outro tipo de erro, o que nenhum teste puro pega: a
 * FIACAO. Alvo atribuido ao time errado, observavel que nunca dispara, unidade
 * que para de andar, cooldown que nunca vence. Foi assim que a JG-04 descobriu
 * que o inimigo trocava de setor no meio do trajeto — o modelo polar estava
 * certo, quem estava errado era quem o chamava.
 *
 * **As tres armadilhas**, todas resolvidas aqui:
 *
 * 1. `DynamicTexture` pede um canvas 2D mesmo com `NullEngine`, e o Node nao
 *    tem `OffscreenCanvas`. Sem o shim abaixo, criar qualquer unidade explode
 *    em `createContactShadow`.
 * 2. `scene.beginDirectAnimation` so existe se o modulo de animacao tiver sido
 *    importado por efeito colateral — com imports granulares ele nao vem junto,
 *    e o fantasma de spawn quebra o teste de fora do `it`.
 * 3. `scene.render()` exige camera. Nao use: o que move o jogo e o
 *    `onBeforeRenderObservable`, e `advanceFrames` o notifica direto.
 *
 * **O relogio.** `deltaTime` vem do engine e os cooldowns vem de uma fonte de
 * tempo propria. Avancar so um dos dois faz a simulacao andar 60 s de movimento
 * em 300 ms de ataque — bug de teste que parece bug de jogo. `advanceFrames`
 * move os dois juntos, e `nowMs()` e o relogio que o modulo sob teste deve
 * receber por injecao (`CombatEngine`, `MatchClock` — os dois aceitam `now`).
 *
 * **Nao substitua `performance.now` global para isso.** Foi a primeira
 * tentativa, e ela quebra o proprio Vitest: o timeout de teste e medido nesse
 * relogio, entao simular 60 s de partida faz o runner declarar timeout de 5 s
 * num teste que rodou em 300 ms de verdade.
 */

// Efeito colateral obrigatorio: sem ele `scene.beginDirectAnimation` nao existe.
import "@babylonjs/core/Animations/animatable";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Logger } from "@babylonjs/core/Misc/logger";
import { Scene } from "@babylonjs/core/scene";

/** Contexto 2D de mentira: `NullEngine` nao desenha, mas a API precisa existir. */
function installOffscreenCanvasShim(): void {
  if ("OffscreenCanvas" in globalThis) {
    return;
  }

  const context: unknown = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "canvas") return { width: 256, height: 256 };
        // `measureText().width` entra em conta aritmetica: devolver um proxy
        // aqui produziria NaN silencioso na largura de texto.
        if (property === "measureText") return () => ({ width: 10 });
        return typeof property === "string" ? () => context : undefined;
      },
      set: () => true,
    }
  );

  class StubOffscreenCanvas {
    public width = 256;
    public height = 256;
    public getContext(): unknown {
      return context;
    }
  }

  (globalThis as Record<string, unknown>).OffscreenCanvas = StubOffscreenCanvas;
}

export interface NullEngineScene {
  engine: NullEngine;
  scene: Scene;
  /**
   * O relogio simulado, em ms. Passe como `now` para o modulo sob teste; ele
   * so anda em `advanceFrames`.
   */
  nowMs(): number;
  /**
   * Roda `frames` quadros de simulacao, avancando `deltaMs` no `deltaTime` do
   * engine E no relogio simulado. `onFrame` roda depois de cada quadro, para
   * amostrar o estado sem precisar de outro laco.
   */
  advanceFrames(frames: number, onFrame?: (frame: number) => void): void;
  /**
   * Espera o tempo REAL de um `setTimeout` do jogo — hoje so o fantasma de
   * invocacao (`playGhostThenMaterialize`), que nao aceita relogio injetado.
   */
  waitRealMs(ms: number): Promise<void>;
  dispose(): void;
}

const DEFAULT_FRAME_DELTA_MS = 33;

export function createNullEngineScene(deltaMs: number = DEFAULT_FRAME_DELTA_MS): NullEngineScene {
  installOffscreenCanvasShim();

  // Sem isto cada cena imprime o banner do Babylon no meio do relatorio do
  // Vitest, uma vez por teste.
  Logger.LogLevels = Logger.NoneLogLevel;

  const engine = new NullEngine();
  const scene = new Scene(engine);

  let simulatedNowMs = 0;

  return {
    engine,
    scene,
    nowMs() {
      return simulatedNowMs;
    },
    advanceFrames(frames, onFrame) {
      engine.getDeltaTime = () => deltaMs;

      for (let frame = 0; frame < frames; frame += 1) {
        simulatedNowMs += deltaMs;
        scene.onBeforeRenderObservable.notifyObservers(scene);
        onFrame?.(frame);
      }
    },
    async waitRealMs(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
