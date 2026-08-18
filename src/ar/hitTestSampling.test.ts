import { describe, it, expect } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  normalizeToCanvas,
  buildSampleOffsets,
  buildClearanceProbeOffsets,
  buildFloorBandSamples,
  fitGroundPlane,
  measureProbeCoverage
} from "./hitTestSampling";
import { ARENA_ARC_DEG, MIN_PLACE_RADIUS_M, sectorOf, toArc } from "../arena/ArenaArc";

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

describe("buildSampleOffsets", () => {
  it("should have first element at center (0, 0)", () => {
    const offsets = buildSampleOffsets(0.06, 2, 6);
    expect(offsets[0].dx).toBe(0);
    expect(offsets[0].dy).toBe(0);
  });

  it("should have correct length: 1 + rings * perRing", () => {
    const rings = 2;
    const perRing = 6;
    const offsets = buildSampleOffsets(0.06, rings, perRing);
    const expectedLength = 1 + rings * perRing;
    expect(offsets.length).toBe(expectedLength);
  });

  it("should have length 13 for rings=2, perRing=6", () => {
    const offsets = buildSampleOffsets(0.06, 2, 6);
    expect(offsets.length).toBe(13);
  });

  it("should distribute points in rings correctly", () => {
    const offsets = buildSampleOffsets(0.1, 1, 4);
    // Should have: 1 center + 1 ring * 4 points = 5 total
    expect(offsets.length).toBe(5);

    // First should be center
    expect(offsets[0].dx).toBe(0);
    expect(offsets[0].dy).toBe(0);

    // Ring 1 should have 4 points at radius 0.1, distributed at angles 0°, 90°, 180°, 270°
    // At angle 0°: cos(0) = 1, sin(0) = 0
    expect(offsets[1].dx).toBeCloseTo(0.1);
    expect(offsets[1].dy).toBeCloseTo(0);

    // At angle 90°: cos(π/2) ≈ 0, sin(π/2) = 1
    expect(offsets[2].dx).toBeCloseTo(0);
    expect(offsets[2].dy).toBeCloseTo(0.1);

    // At angle 180°: cos(π) = -1, sin(π) = 0
    expect(offsets[3].dx).toBeCloseTo(-0.1);
    expect(offsets[3].dy).toBeCloseTo(0);

    // At angle 270°: cos(3π/2) ≈ 0, sin(3π/2) = -1
    expect(offsets[4].dx).toBeCloseTo(0);
    expect(offsets[4].dy).toBeCloseTo(-0.1);
  });
});

describe("fitGroundPlane", () => {
  it("should return null for empty points array", () => {
    const result = fitGroundPlane([]);
    expect(result).toBeNull();
  });

  it("should return null when inliers < minInliers", () => {
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(1, 1, 1)
    ];
    const result = fitGroundPlane(points, 3);
    expect(result).toBeNull();
  });

  it("should fit a perfect horizontal plane at y=2", () => {
    const points = [
      new Vector3(0, 2, 0),
      new Vector3(1, 2, 0),
      new Vector3(0, 2, 1),
      new Vector3(1, 2, 1)
    ];
    const result = fitGroundPlane(points);
    expect(result).not.toBeNull();
    expect(result!.position.y).toBeCloseTo(2);
    expect(result!.normal.x).toBeCloseTo(0, 5);
    expect(result!.normal.y).toBeCloseTo(1, 5);
    expect(result!.normal.z).toBeCloseTo(0, 5);
  });

  it("should reject a gross height outlier", () => {
    const points = [
      new Vector3(0, 2, 0),
      new Vector3(1, 2, 0),
      new Vector3(0, 2, 1),
      new Vector3(1, 2, 1),
      new Vector3(0.5, 50, 0.5)  // Huge outlier at y=50
    ];
    const result = fitGroundPlane(points);
    expect(result).not.toBeNull();
    expect(result!.position.y).toBeCloseTo(2);
    expect(result!.normal.y).toBeCloseTo(1, 5);
  });

  it("should fit an inclined plane (y = 0.5*x)", () => {
    // Generate points on the plane y = 0.5*x + 0*z + 0
    // with varying z to ensure the system is well-conditioned
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0.5, 0),
      new Vector3(2, 1.0, 0),
      new Vector3(0, 0, 1),
      new Vector3(1, 0.5, 1),
      new Vector3(2, 1.0, 1)
    ];
    const result = fitGroundPlane(points);
    expect(result).not.toBeNull();
    expect(result!.normal.y).toBeGreaterThan(0);
    // For y = 0.5*x, the normal should have a negative x component (sloping upward in +x direction)
    expect(result!.normal.x).toBeLessThan(0);
  });

  it("should compute centroid correctly", () => {
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(2, 0, 0),
      new Vector3(0, 0, 2),
      new Vector3(2, 0, 2)
    ];
    const result = fitGroundPlane(points);
    expect(result).not.toBeNull();
    expect(result!.position.x).toBeCloseTo(1);
    expect(result!.position.y).toBeCloseTo(0);
    expect(result!.position.z).toBeCloseTo(1);
  });

  it("should handle coplanar collinear points gracefully (degenerate case)", () => {
    // All points on a line, which is degenerate for plane fitting
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 1),
      new Vector3(2, 0, 2)
    ];
    const result = fitGroundPlane(points);
    expect(result).not.toBeNull();
    // Should fallback to (0, 1, 0) normal for degenerate case
    expect(result!.normal.x).toBeCloseTo(0, 5);
    expect(result!.normal.y).toBeCloseTo(1, 5);
    expect(result!.normal.z).toBeCloseTo(0, 5);
  });

  it("should ensure normal points upward (y > 0)", () => {
    // Create a plane that might naturally have negative y normal
    const points = [
      new Vector3(0, 2, 0),
      new Vector3(1, 2, 0),
      new Vector3(0, 2, 1),
      new Vector3(1, 2, 1)
    ];
    const result = fitGroundPlane(points);
    expect(result).not.toBeNull();
    expect(result!.normal.y).toBeGreaterThan(0);
  });

  it("should filter points at consistent height when MAD is 0", () => {
    // All points at exactly y=5
    const points = [
      new Vector3(0, 5, 0),
      new Vector3(1, 5, 0),
      new Vector3(0, 5, 1)
    ];
    const result = fitGroundPlane(points);
    expect(result).not.toBeNull();
    expect(result!.position.y).toBeCloseTo(5);
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

describe("buildClearanceProbeOffsets", () => {
  const RINGS = 2;
  const PER_RING = 5;

  it("devolve rings x perRing sondas", () => {
    const offsets = buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, RINGS, PER_RING, ARENA_ARC_DEG);

    expect(offsets.length).toBe(RINGS * PER_RING);
  });

  it("nenhuma sonda passa do raio minimo de colocacao", () => {
    const offsets = buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, RINGS, PER_RING, ARENA_ARC_DEG);

    for (const { dx, dz } of offsets) {
      expect(toArc({ x: dx, z: dz }).radiusM).toBeLessThanOrEqual(MIN_PLACE_RADIUS_M + 1e-9);
    }
  });

  // O que esta ATRAS do jogador nao recebe conteudo, entao nao pode reprovar o
  // fechamento da arena — uma parede as costas e o caso normal, nao um erro.
  it("nenhuma sonda cai fora do arco da arena", () => {
    const offsets = buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, RINGS, PER_RING, ARENA_ARC_DEG);

    for (const { dx, dz } of offsets) {
      expect(sectorOf(toArc({ x: dx, z: dz }).azimuthDeg)).not.toBeNull();
    }
  });

  it("cobre os tres setores do arco", () => {
    const offsets = buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, RINGS, PER_RING, ARENA_ARC_DEG);
    const sectors = new Set(offsets.map(({ dx, dz }) => sectorOf(toArc({ x: dx, z: dz }).azimuthDeg)));

    expect(sectors).toEqual(new Set(["left", "center", "right"]));
  });

  it("usa raios diferentes por anel, todos positivos", () => {
    const offsets = buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, RINGS, PER_RING, ARENA_ARC_DEG);
    const radii = new Set(
      offsets.map(({ dx, dz }) => Number(toArc({ x: dx, z: dz }).radiusM.toFixed(6)))
    );

    expect(radii.size).toBe(RINGS);

    for (const radius of radii) {
      expect(radius).toBeGreaterThan(0);
    }
  });

  // Sem defasagem os dois aneis ficam alinhados no mesmo azimute e uma quina de
  // movel passa entre as sondas sem ser vista por nenhuma delas.
  it("defasa os aneis pares para nao alinhar as sondas no mesmo raio", () => {
    const offsets = buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, RINGS, PER_RING, ARENA_ARC_DEG);
    const azimuths = offsets.map(({ dx, dz }) =>
      Number(toArc({ x: dx, z: dz }).azimuthDeg.toFixed(4))
    );

    expect(new Set(azimuths).size).toBeGreaterThan(PER_RING);
  });

  it("devolve lista vazia para configuracao degenerada, sem quebrar", () => {
    expect(buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, 0, 5, ARENA_ARC_DEG)).toEqual([]);
    expect(buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, 2, 0, ARENA_ARC_DEG)).toEqual([]);
  });
});

describe("measureProbeCoverage", () => {
  const flatFit = {
    position: new Vector3(0, 0, 0),
    normal: new Vector3(0, 1, 0)
  };

  const PROBES = buildClearanceProbeOffsets(MIN_PLACE_RADIUS_M, 2, 5, ARENA_ARC_DEG);

  it("sondas em quadro e no plano contam como onPlane", () => {
    const probes = PROBES.map((offset, i) => ({
      // Posicoes de tela validas quaisquer; so precisam estar dentro de [0,1].
      screenX: 0.4 + i * 0.01,
      screenY: 0.6 + i * 0.01,
      hit: new Vector3(offset.dx, 0, offset.dz)
    }));

    const coverage = measureProbeCoverage(probes, flatFit, 0.02);

    expect(coverage).toEqual({
      inFrame: PROBES.length,
      offPlane: 0,
      onPlane: PROBES.length,
      total: PROBES.length
    });
  });

  it("sondas fora de [0,1] nao contam em nada", () => {
    const probes = PROBES.map((offset, i) => ({
      screenX: i < 2 ? -0.1 : 0.5,
      screenY: i < 2 ? 1.5 : 0.5,
      hit: new Vector3(offset.dx, 0, offset.dz)
    }));

    const coverage = measureProbeCoverage(probes, flatFit, 0.02);

    expect(coverage.inFrame).toBe(PROBES.length - 2);
    expect(coverage.onPlane).toBe(PROBES.length - 2);
    expect(coverage.offPlane).toBe(0);
  });

  // Este e o caso que o gate usa como PROVA CONTRARIA: superficie real num
  // degrau acima do piso = tem um movel ali.
  it("sondas num degrau acima do piso contam em offPlane, nao em onPlane", () => {
    const probes = PROBES.map(offset => ({
      screenX: 0.5,
      screenY: 0.7,
      hit: new Vector3(offset.dx, 0.45, offset.dz)
    }));

    const coverage = measureProbeCoverage(probes, flatFit, 0.02);

    expect(coverage.inFrame).toBe(PROBES.length);
    expect(coverage.onPlane).toBe(0);
    expect(coverage.offPlane).toBe(PROBES.length);
  });

  // E este e o caso que NAO pode ser tratado como prova de nada: o hitTest
  // falhou. Silencio do sensor nao e evidencia de que ha obstaculo.
  it("sonda sem hit nao conta nem em onPlane nem em offPlane", () => {
    const probes = PROBES.map(() => ({
      screenX: 0.5,
      screenY: 0.7,
      hit: null as Vector3 | null
    }));

    const coverage = measureProbeCoverage(probes, flatFit, 0.02);

    expect(coverage.inFrame).toBe(PROBES.length);
    expect(coverage.onPlane).toBe(0);
    expect(coverage.offPlane).toBe(0);
    expect(coverage.total).toBe(PROBES.length);
  });
});
