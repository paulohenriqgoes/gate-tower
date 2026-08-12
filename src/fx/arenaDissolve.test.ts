import { describe, expect, it } from "vitest";

import { computeElementDelayMs } from "./arenaDissolve";

describe("computeElementDelayMs", () => {
  it("e deterministico: mesma entrada sempre devolve o mesmo atraso", () => {
    const input = { distanceFromCenter: 4, durationMs: 2600, index: 3, maxDistanceFromCenter: 10 };

    expect(computeElementDelayMs(input)).toBe(computeElementDelayMs(input));
  });

  it("elementos mais distantes do centro (borda) comecam antes dos mais proximos (centro)", () => {
    const durationMs = 2600;
    const maxDistanceFromCenter = 10;
    // Mesmo indice para os dois: isola o efeito da distancia (o jitter
    // pseudo-aleatorio depende so do indice, entao fica identico nos dois).
    const index = 7;

    const edgeDelay = computeElementDelayMs({
      distanceFromCenter: 10,
      durationMs,
      index,
      maxDistanceFromCenter,
    });
    const centerDelay = computeElementDelayMs({
      distanceFromCenter: 0,
      durationMs,
      index,
      maxDistanceFromCenter,
    });

    expect(edgeDelay).toBeLessThan(centerDelay);
  });

  it("nunca devolve atraso negativo", () => {
    for (let index = 0; index < 50; index += 1) {
      const delay = computeElementDelayMs({
        distanceFromCenter: index % 2 === 0 ? 0 : 12,
        durationMs: 2600,
        index,
        maxDistanceFromCenter: 12,
      });

      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });

  it("nunca deixa tempo insuficiente para o encolhimento do elemento terminar dentro da duracao total", () => {
    const durationMs = 1000; // duracao curta o bastante para o clamp entrar em acao
    const elementShrinkMs = 550; // mesmo valor de ELEMENT_SHRINK_MS em arenaDissolve.ts

    for (let index = 0; index < 20; index += 1) {
      const delay = computeElementDelayMs({
        distanceFromCenter: 0, // pior caso: maior atraso base (centro)
        durationMs,
        index,
        maxDistanceFromCenter: 10,
      });

      expect(delay).toBeLessThanOrEqual(durationMs - elementShrinkMs);
    }
  });

  it("distancia zero (sem elementos fora do centro) nao gera divisao por zero", () => {
    const delay = computeElementDelayMs({
      distanceFromCenter: 0,
      durationMs: 2600,
      index: 0,
      maxDistanceFromCenter: 0,
    });

    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});
