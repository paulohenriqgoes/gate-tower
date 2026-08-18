import { describe, expect, it } from "vitest";

import { computeFadeAlpha, shouldWriteVisibility } from "./proximityFade";

const START_M = 1.2;
const END_M = 0.6;

describe("computeFadeAlpha", () => {
  it("opaco (alpha 1) em e alem de startM", () => {
    expect(computeFadeAlpha(START_M, START_M, END_M)).toBe(1);
    expect(computeFadeAlpha(START_M + 0.5, START_M, END_M)).toBe(1);
    expect(computeFadeAlpha(100, START_M, END_M)).toBe(1);
  });

  it("invisivel (alpha 0) em e abaixo de endM", () => {
    expect(computeFadeAlpha(END_M, START_M, END_M)).toBe(0);
    expect(computeFadeAlpha(END_M - 0.1, START_M, END_M)).toBe(0);
    expect(computeFadeAlpha(0, START_M, END_M)).toBe(0);
  });

  it("no meio exato da janela, alpha e 0.5 (smoothstep e simetrico)", () => {
    const midpoint = (START_M + END_M) / 2;
    expect(computeFadeAlpha(midpoint, START_M, END_M)).toBeCloseTo(0.5, 10);
  });

  it("monotonicidade: varrendo de endM a startM, alpha nunca diminui conforme a distancia aumenta", () => {
    const steps = 200;
    let previousAlpha = computeFadeAlpha(END_M, START_M, END_M);

    for (let i = 1; i <= steps; i += 1) {
      const distanceM = END_M + ((START_M - END_M) * i) / steps;
      const alpha = computeFadeAlpha(distanceM, START_M, END_M);

      expect(alpha).toBeGreaterThanOrEqual(previousAlpha);
      previousAlpha = alpha;
    }
  });

  it("suavidade nas pontas: perto de startM, o smoothstep fica bem mais perto de 1 do que a interpolacao linear ficaria", () => {
    // A 10% de dentro da janela partindo de startM (t linear = 0.9), a linear
    // daria alpha = 0.9. O smoothstep, por ter derivada ~0 no topo, fica bem
    // mais colado em 1.
    const distanceM = END_M + 0.9 * (START_M - END_M);
    const linearAlpha = 0.9;
    const smoothAlpha = computeFadeAlpha(distanceM, START_M, END_M);

    expect(smoothAlpha).toBeGreaterThan(linearAlpha);
    expect(smoothAlpha).toBeGreaterThan(0.96);
  });

  it("suavidade nas pontas: perto de endM, o smoothstep fica bem mais perto de 0 do que a interpolacao linear ficaria", () => {
    // A 10% de dentro da janela partindo de endM (t linear = 0.1), a linear
    // daria alpha = 0.1. O smoothstep fica bem mais colado em 0.
    const distanceM = END_M + 0.1 * (START_M - END_M);
    const linearAlpha = 0.1;
    const smoothAlpha = computeFadeAlpha(distanceM, START_M, END_M);

    expect(smoothAlpha).toBeLessThan(linearAlpha);
    expect(smoothAlpha).toBeLessThan(0.04);
  });

  it("resultado esta sempre em [0, 1] e e finito, varrendo distancias dentro e fora da janela", () => {
    for (let d = -2; d <= 3; d += 0.1) {
      const alpha = computeFadeAlpha(d, START_M, END_M);
      expect(Number.isFinite(alpha)).toBe(true);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  describe("casos degenerados", () => {
    it("startM === endM (janela de fade zero) devolve 0 deterministicamente", () => {
      expect(computeFadeAlpha(1, 1, 1)).toBe(0);
      expect(computeFadeAlpha(0.5, 1, 1)).toBe(0);
      expect(computeFadeAlpha(2, 1, 1)).toBe(0);
    });

    it("startM < endM (janela invertida) devolve 0 deterministicamente", () => {
      expect(computeFadeAlpha(1, END_M, START_M)).toBe(0);
      expect(computeFadeAlpha(0, END_M, START_M)).toBe(0);
    });

    it("distanceM negativo nunca produz NaN e fica clampado em 0", () => {
      const alpha = computeFadeAlpha(-5, START_M, END_M);
      expect(Number.isFinite(alpha)).toBe(true);
      expect(alpha).toBe(0);
    });

    it("NaN em distanceM devolve 0, nunca NaN", () => {
      const alpha = computeFadeAlpha(NaN, START_M, END_M);
      expect(Number.isFinite(alpha)).toBe(true);
      expect(alpha).toBe(0);
    });

    it("NaN em startM ou endM devolve 0, nunca NaN", () => {
      expect(computeFadeAlpha(1, NaN, END_M)).toBe(0);
      expect(computeFadeAlpha(1, START_M, NaN)).toBe(0);
      expect(computeFadeAlpha(1, NaN, NaN)).toBe(0);
    });
  });
});

describe("shouldWriteVisibility", () => {
  it("nao escreve quando a diferenca esta dentro do epsilon default", () => {
    expect(shouldWriteVisibility(0.5001, 0.5)).toBe(false);
    expect(shouldWriteVisibility(0.5, 0.5)).toBe(false);
  });

  it("escreve quando a diferenca passa do epsilon default", () => {
    expect(shouldWriteVisibility(0.6, 0.5)).toBe(true);
    expect(shouldWriteVisibility(0, 1)).toBe(true);
  });

  it("respeita um epsilon customizado", () => {
    expect(shouldWriteVisibility(0.52, 0.5, 0.1)).toBe(false);
    expect(shouldWriteVisibility(0.62, 0.5, 0.1)).toBe(true);
  });
});
