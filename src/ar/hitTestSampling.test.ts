import { describe, it, expect } from "vitest";
import { buildFloorBandSamples, normalizeToCanvas } from "./hitTestSampling";

describe("normalizeToCanvas", () => {
  it("should normalize center (50, 50) of 100x100 canvas to (0.5, 0.5)", () => {
    const canvas = { clientWidth: 100, clientHeight: 100 };
    const result = normalizeToCanvas(50, 50, canvas);
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBeCloseTo(0.5);
  });

  it("should clamp values above 1", () => {
    const canvas = { clientWidth: 100, clientHeight: 100 };
    const result = normalizeToCanvas(150, 150, canvas);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(1);
  });

  it("should clamp values below 0", () => {
    const canvas = { clientWidth: 100, clientHeight: 100 };
    const result = normalizeToCanvas(-50, -50, canvas);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it("should return x=0 when canvas width is 0", () => {
    const canvas = { clientWidth: 0, clientHeight: 100 };
    const result = normalizeToCanvas(50, 50, canvas);
    expect(result.x).toBe(0);
    expect(result.y).toBeCloseTo(0.5);
  });

  it("should return y=0 when canvas height is 0", () => {
    const canvas = { clientWidth: 100, clientHeight: 0 };
    const result = normalizeToCanvas(50, 50, canvas);
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBe(0);
  });
});

describe("buildFloorBandSamples", () => {
  it("devolve rows x cols amostras, todas dentro de [0,1]", () => {
    const samples = buildFloorBandSamples(3, 3, 0.58, 0.9, 0.22);

    expect(samples.length).toBe(9);

    for (const sample of samples) {
      expect(sample.x).toBeGreaterThanOrEqual(0);
      expect(sample.x).toBeLessThanOrEqual(1);
      expect(sample.y).toBeGreaterThanOrEqual(0);
      expect(sample.y).toBeLessThanOrEqual(1);
    }
  });

  // A premissa inteira da amostragem: em retrato, com o jogador de pe, o chao
  // a frente aparece na METADE INFERIOR da tela. Uma amostra acima da metade
  // estaria mirando a parede do fundo ou o teto.
  it("mantem todas as amostras na metade inferior da tela", () => {
    for (const sample of buildFloorBandSamples(3, 3, 0.58, 0.9, 0.22)) {
      expect(sample.y).toBeGreaterThan(0.5);
    }
  });

  it("cobre a faixa inteira: a primeira linha e a de cima, a ultima a de baixo", () => {
    const samples = buildFloorBandSamples(3, 3, 0.58, 0.9, 0.22);

    expect(samples[0].y).toBeCloseTo(0.58);
    expect(samples[samples.length - 1].y).toBeCloseTo(0.9);
  });

  it("recua das bordas laterais, onde a incidencia e rasa demais", () => {
    const samples = buildFloorBandSamples(3, 3, 0.58, 0.9, 0.22);
    const xs = samples.map((sample) => sample.x);

    expect(Math.min(...xs)).toBeCloseTo(0.22);
    expect(Math.max(...xs)).toBeCloseTo(0.78);
  });

  it("centraliza quando ha uma linha/coluna so, em vez de colar numa ponta", () => {
    const samples = buildFloorBandSamples(1, 1, 0.6, 0.9, 0.2);

    expect(samples.length).toBe(1);
    expect(samples[0].x).toBeCloseTo(0.5);
    expect(samples[0].y).toBeCloseTo(0.75);
  });

  it("devolve lista vazia para grade degenerada, sem quebrar", () => {
    expect(buildFloorBandSamples(0, 3, 0.6, 0.9, 0.2)).toEqual([]);
    expect(buildFloorBandSamples(3, 0, 0.6, 0.9, 0.2)).toEqual([]);
  });
});
