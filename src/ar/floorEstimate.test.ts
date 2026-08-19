import { describe, expect, it } from "vitest";

import {
  AGREEING_SAMPLES_TO_JUMP,
  EMA_ALPHA,
  FloorTracker,
  JUMP_TOLERANCE_M,
  MAX_SPREAD_M,
  measureFloor,
  type FloorSample,
  type Point3,
} from "./floorEstimate";

/** Atalho para montar um `FloorSample` sem passar por `measureFloor`, para testar `FloorTracker` isoladamente do fit. */
function sample(floorY: number, spreadM = 0.02): FloorSample {
  return { floorY, tiltDeg: 0, spreadM, inliers: 6 };
}

describe("measureFloor", () => {
  it("retorna null para lista vazia", () => {
    expect(measureFloor([])).toBeNull();
  });

  it("retorna null quando sobram menos inliers que minInliers", () => {
    const points: Point3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    expect(measureFloor(points, 3)).toBeNull();
  });

  it("a mediana do Y ignora um outlier grosseiro (5 pontos em y=0, 1 em y=0.4)", () => {
    const points: Point3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 0.5, y: 0, z: 0.5 },
      { x: 0.5, y: 0.4, z: 0.5 }, // outlier: alguem tocou o pe ou um objeto no meio do chao
    ];

    const result = measureFloor(points);

    expect(result).not.toBeNull();
    expect(result!.floorY).toBeCloseTo(0, 5);
    expect(result!.inliers).toBe(5);
  });

  // Esta e a diferenca que motivou trocar centroide por mediana: um grupo de
  // inliers assimetrico (nenhum e outlier isolado o bastante para ser
  // rejeitado pelo filtro de MAD, mas a distribuicao pende para um lado) faz
  // a MEDIA divergir da MEDIANA. Se `floorY` fosse a media, o piso relatado
  // seria puxado para o lado com mais amostras extremas.
  it("usa a MEDIANA e nao o centroide: um grupo assimetrico de inliers faria a media errar", () => {
    // y: -0.05, -0.03, 0, 0.03, 0.05, 0.05, 0.09 -- todos sobrevivem ao filtro
    // de MAD (nenhum e outlier isolado), mas a cauda para cima e mais pesada.
    const ys = [-0.05, -0.03, 0, 0.03, 0.05, 0.05, 0.09];
    const points: Point3[] = ys.map((y, i) => ({ x: i * 0.1, y, z: (i % 2) * 0.1 }));

    const result = measureFloor(points);

    expect(result).not.toBeNull();
    expect(result!.inliers).toBe(ys.length); // nenhum foi rejeitado
    const naiveMean = ys.reduce((a, b) => a + b, 0) / ys.length;

    expect(result!.floorY).toBeCloseTo(0.03, 5); // mediana
    expect(naiveMean).toBeCloseTo(0.02, 5); // a media daria um numero diferente
    expect(result!.floorY).not.toBeCloseTo(naiveMean, 5);
  });

  it("spreadM e max(y) - min(y) dos inliers", () => {
    const ys = [-0.02, 0, 0.02, 0.03, 0.05];
    const points: Point3[] = ys.map((y, i) => ({ x: i * 0.2, y, z: 0 }));

    const result = measureFloor(points);

    expect(result).not.toBeNull();
    expect(result!.inliers).toBe(ys.length);
    expect(result!.spreadM).toBeCloseTo(0.07, 5);
  });

  it("tiltDeg ~0 para pontos coplanares horizontais", () => {
    const points: Point3[] = [
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 0.5, y: 1, z: 0.5 },
    ];

    const result = measureFloor(points);

    expect(result).not.toBeNull();
    expect(result!.tiltDeg).toBeCloseTo(0, 5);
  });

  it("tiltDeg ~5 graus para um plano inclinado 5 graus construido analiticamente", () => {
    // y = tan(5deg) * x + 0*z + 0. O angulo entre a normal do plano e a
    // vertical, para um piso com essa forma, e exatamente a inclinacao do
    // piso: tan(tilt) = |dy/dx| -- por isso o valor esperado e 5.
    const slope = Math.tan((5 * Math.PI) / 180);
    const xs = [-1, 0, 1];
    const zs = [-1, 0, 1];
    const points: Point3[] = [];

    for (const x of xs) {
      for (const z of zs) {
        points.push({ x, y: slope * x, z });
      }
    }

    const result = measureFloor(points);

    expect(result).not.toBeNull();
    expect(result!.inliers).toBe(points.length); // nenhum ponto e outlier aqui
    expect(result!.tiltDeg).toBeCloseTo(5, 1);
  });

  it("tiltDeg e 0 (nunca NaN) para pontos colineares -- sistema degenerado", () => {
    const points: Point3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 2 },
    ];

    const result = measureFloor(points);

    expect(result).not.toBeNull();
    expect(result!.tiltDeg).toBe(0);
    expect(Number.isNaN(result!.tiltDeg)).toBe(false);
  });
});

describe("FloorTracker", () => {
  it("expoe os defaults documentados", () => {
    expect(JUMP_TOLERANCE_M).toBeCloseTo(0.05);
    expect(EMA_ALPHA).toBeCloseTo(0.25);
    expect(AGREEING_SAMPLES_TO_JUMP).toBe(3);
    expect(MAX_SPREAD_M).toBeCloseTo(0.12);
  });

  it("comeca sem altura vigente, e a primeira amostra valida vira current direto", () => {
    const tracker = new FloorTracker();

    expect(tracker.current).toBeNull();

    const result = tracker.push(sample(1.2));

    expect(result).toBeCloseTo(1.2);
    expect(tracker.current).toBeCloseTo(1.2);
  });

  it("push(null) preserva a altura vigente -- silencio do sensor nao e mudanca", () => {
    const tracker = new FloorTracker();
    tracker.push(sample(1.2));

    expect(tracker.push(null)).toBeCloseTo(1.2);
    expect(tracker.push(null)).toBeCloseTo(1.2);
    expect(tracker.current).toBeCloseTo(1.2);
  });

  it("descarta amostra com spreadM acima de maxSpreadM, como se fosse null", () => {
    const tracker = new FloorTracker();
    tracker.push(sample(1.0));

    const dirty = sample(1.5, 0.2); // spread > MAX_SPREAD_M (0.12)
    const result = tracker.push(dirty);

    expect(result).toBeCloseTo(1.0);
    expect(tracker.current).toBeCloseTo(1.0);
  });

  it("dentro da tolerancia, ruido de +-2cm converge para a media em poucas amostras (EMA)", () => {
    const tracker = new FloorTracker();
    const target = 0.03;
    const noise = 0.02;

    tracker.push(sample(target)); // baseline, sem ruido

    for (let i = 0; i < 12; i += 1) {
      const noisy = i % 2 === 0 ? target + noise : target - noise;
      tracker.push(sample(noisy));
    }

    expect(tracker.current).not.toBeNull();
    expect(Math.abs(tracker.current! - target)).toBeLessThan(0.01);
  });

  it("um degrau isolado de 30cm nao move a altura", () => {
    const tracker = new FloorTracker();
    tracker.push(sample(0));

    tracker.push(sample(0.3)); // 1a amostra fora da tolerancia
    expect(tracker.current).toBeCloseTo(0);

    tracker.push(sample(0.001)); // volta ao normal, quebra a serie
    expect(tracker.current).toBeCloseTo(0, 2);
  });

  it("tres degraus consecutivos e concordantes movem a altura para a mediana deles", () => {
    const tracker = new FloorTracker();
    tracker.push(sample(0));

    tracker.push(sample(0.3));
    expect(tracker.current).toBeCloseTo(0); // ainda so 1 candidata

    tracker.push(sample(0.31));
    expect(tracker.current).toBeCloseTo(0); // ainda so 2 candidatas

    const result = tracker.push(sample(0.29)); // 3a candidata concordante -- assume

    expect(result).toBeCloseTo(0.3, 2);
    expect(tracker.current).toBeCloseTo(0.3, 2);
  });

  it("degrau + amostra normal + outro degrau nao move -- a sequencia foi quebrada", () => {
    const tracker = new FloorTracker();
    tracker.push(sample(0));

    tracker.push(sample(0.3)); // candidata 1
    tracker.push(sample(0)); // dentro da tolerancia de current -- zera a serie
    const beforeSecondStep = tracker.current;

    tracker.push(sample(0.3)); // candidata 1 de novo, de uma serie NOVA

    // Uma unica candidata nunca e suficiente para mover, entao a altura
    // continua onde estava depois da amostra normal do meio.
    expect(tracker.current).toBeCloseTo(beforeSecondStep!, 5);
    expect(tracker.current).not.toBeCloseTo(0.3, 1);
  });

  it("push(null) no meio de uma serie de degrau preserva o contador de candidatos", () => {
    const tracker = new FloorTracker();
    tracker.push(sample(0));

    tracker.push(sample(0.3)); // candidata 1
    tracker.push(null);
    tracker.push(null);
    expect(tracker.current).toBeCloseTo(0); // null nao mudou nada

    tracker.push(sample(0.31)); // candidata 2 (nulls nao resetaram a serie)
    tracker.push(null);

    const result = tracker.push(sample(0.29)); // candidata 3 -- deveria assumir

    expect(result).toBeCloseTo(0.3, 2);
  });

  it("reset() limpa altura vigente e candidatos em andamento", () => {
    const tracker = new FloorTracker();
    tracker.push(sample(1));
    tracker.push(sample(1.3)); // comeca uma serie de degrau

    tracker.reset();

    expect(tracker.current).toBeNull();

    // Depois do reset, uma unica amostra fora do que quer que fosse antes
    // vira a nova altura direto (nao ha serie de candidatos sobrevivendo).
    const result = tracker.push(sample(2));
    expect(result).toBeCloseTo(2);
  });
});
