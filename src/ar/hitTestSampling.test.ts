import { describe, it, expect } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  normalizeToCanvas,
  buildSampleOffsets,
  fitGroundPlane,
  measurePlaneCoverage
} from "./hitTestSampling";

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

describe("measurePlaneCoverage", () => {
  const flatFit = {
    position: new Vector3(0, 0, 0),
    normal: new Vector3(0, 1, 0)
  };
  const forwardZ = new Vector3(0, 0, 1);

  it("mede a extensao nos dois eixos de uma superficie plana", () => {
    // Retangulo de 0.4 (X) por 1.2 (Z) no plano y = 0.
    const points = [
      new Vector3(-0.2, 0, -0.6),
      new Vector3(0.2, 0, -0.6),
      new Vector3(-0.2, 0, 0.6),
      new Vector3(0.2, 0, 0.6)
    ];

    const coverage = measurePlaneCoverage(points, flatFit, forwardZ, 0.05);

    expect(coverage.depth).toBeCloseTo(1.2);
    expect(coverage.width).toBeCloseTo(0.4);
    expect(coverage.inlierCount).toBe(4);
  });

  it("descarta pontos fora do plano (a mesa nao herda a extensao do chao)", () => {
    const points = [
      new Vector3(0, 0, -0.2),
      new Vector3(0, 0, 0.2),
      // Chao 70 cm abaixo da mesa: nao pode contar como extensao da mesa.
      new Vector3(0, -0.7, -2),
      new Vector3(0, -0.7, 2)
    ];

    const coverage = measurePlaneCoverage(points, flatFit, forwardZ, 0.05);

    expect(coverage.inlierCount).toBe(2);
    expect(coverage.depth).toBeCloseTo(0.4);
  });

  it("mede ao longo da direcao informada, nao dos eixos do mundo", () => {
    // Faixa longa no eixo X; com forward = +X ela conta como profundidade.
    const points = [
      new Vector3(-0.5, 0, 0),
      new Vector3(0.5, 0, 0),
      new Vector3(0, 0, -0.1),
      new Vector3(0, 0, 0.1)
    ];

    const coverage = measurePlaneCoverage(points, flatFit, new Vector3(1, 0, 0), 0.05);

    expect(coverage.depth).toBeCloseTo(1);
    expect(coverage.width).toBeCloseTo(0.2);
  });

  it("devolve zero quando nenhum ponto pertence ao plano", () => {
    const points = [new Vector3(0, 3, 0), new Vector3(1, 3, 1)];

    const coverage = measurePlaneCoverage(points, flatFit, forwardZ, 0.05);

    expect(coverage.inlierCount).toBe(0);
    expect(coverage.depth).toBe(0);
    expect(coverage.width).toBe(0);
  });

  it("nao quebra quando forward e paralelo a normal", () => {
    const points = [
      new Vector3(-0.3, 0, -0.3),
      new Vector3(0.3, 0, 0.3)
    ];

    const coverage = measurePlaneCoverage(points, flatFit, new Vector3(0, 1, 0), 0.05);

    expect(coverage.inlierCount).toBe(2);
    expect(Number.isFinite(coverage.depth)).toBe(true);
    expect(Number.isFinite(coverage.width)).toBe(true);
  });
});
