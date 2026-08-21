import { describe, expect, it } from "vitest";

import { ARENA_ARC_DEG, evaluatePlacement, reachableSectors } from "../arena/ArenaArc";
import { CARD_CATALOG } from "../cards/cardCatalog";
import { WaveDirector } from "./WaveDirector";
import { FIRST_WAVE_CARD_ID, WAVE_PLAN } from "./wavePlan";

const MATCH_DURATION_MS = 180_000;
const FINAL_MINUTE_MS = 120_000;

describe("WAVE_PLAN", () => {
  it("esta ordenado por atMs crescente", () => {
    const times = WAVE_PLAN.map((wave) => wave.atMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("so usa cartas que existem no catalogo", () => {
    const catalogIds = new Set(CARD_CATALOG.map((card) => card.id));

    for (const wave of WAVE_PLAN) {
      for (const entry of wave.entries) {
        expect(catalogIds.has(entry.cardId)).toBe(true);
      }
    }
  });

  it("toda onda cabe dentro da partida de 3 minutos", () => {
    for (const wave of WAVE_PLAN) {
      expect(wave.atMs).toBeGreaterThan(0);
      expect(wave.atMs).toBeLessThan(MATCH_DURATION_MS);
    }
  });

  it("o ultimo minuto tem mais inimigos por segundo que os dois primeiros", () => {
    const countIn = (waves: typeof WAVE_PLAN): number =>
      waves.reduce((total, wave) => total + wave.entries.reduce((sum, entry) => sum + entry.count, 0), 0);

    const early = WAVE_PLAN.filter((wave) => wave.atMs < FINAL_MINUTE_MS);
    const late = WAVE_PLAN.filter((wave) => wave.atMs >= FINAL_MINUTE_MS);

    const earlyRate = countIn(early) / FINAL_MINUTE_MS;
    const lateRate = countIn(late) / (MATCH_DURATION_MS - FINAL_MINUTE_MS);

    expect(lateRate).toBeGreaterThan(earlyRate);
  });

  it("FIRST_WAVE_CARD_ID e a carta da primeira onda", () => {
    expect(FIRST_WAVE_CARD_ID).toBe(WAVE_PLAN[0].entries[0].cardId);
  });
});

/**
 * O criterio de aceite da JG-04 nao e sobre uma onda inventada de teste: e
 * sobre O PLANO que o jogo usa. Aqui a partida inteira e simulada com o jogador
 * girando o celular, checando as duas garantias em todo nascimento real.
 */
describe("WAVE_PLAN rodando no WaveDirector", () => {
  it("nenhum inimigo nasce em setor enquadrado, e nenhum nasce fora do anel legal", () => {
    // Yaw varrendo o arco (e um pouco alem, para cobrir o jogador olhando para
    // a borda) enquanto o tempo corre — o mesmo movimento que a partida pede.
    let cameraYawDeg = -90;

    const director = new WaveDirector({
      getCameraYawDeg: () => cameraYawDeg,
      waves: WAVE_PLAN,
      // rng deterministico: o teste falha por regra quebrada, nunca por sorte.
      rng: (() => {
        let seed = 1;
        return () => {
          seed = (seed * 1664525 + 1013904223) % 4294967296;
          return seed / 4294967296;
        };
      })(),
    });

    let spawned = 0;

    for (let elapsedMs = 0; elapsedMs <= 180_000; elapsedMs += 250) {
      // Varre a arena inteira de ponta a ponta, com passo que nao e divisor da
      // largura do arco — assim as leituras nao caem sempre nas mesmas
      // fronteiras de setor.
      const half = ARENA_ARC_DEG / 2;
      cameraYawDeg = -half + ((elapsedMs / 250) % (ARENA_ARC_DEG + 7));
      const reachable = new Set(reachableSectors(cameraYawDeg));

      for (const order of director.update(elapsedMs)) {
        spawned += 1;
        // O inimigo nunca nasce onde o jogador CONSEGUE AGIR agora. Ele pode
        // nascer a vista — ver e de graca desde 2026-08-21 —, mas nunca dentro
        // do cone que o jogador ja esta cobrindo.
        expect(reachable.has(order.sector)).toBe(false);
        expect(evaluatePlacement(order.point).ok).toBe(true);
      }
    }

    const planned = WAVE_PLAN.reduce(
      (total, wave) => total + wave.entries.reduce((sum, entry) => sum + entry.count, 0),
      0
    );
    expect(spawned).toBe(planned);
  });
});
