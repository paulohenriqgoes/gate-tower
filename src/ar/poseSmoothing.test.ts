import { describe, expect, it } from "vitest";

import {
  HEADING_SNAP_DEG,
  HEADING_TAU_SECONDS,
  ORIGIN_SNAP_M,
  ORIGIN_TAU_SECONDS,
  SmoothedAngleDeg,
  SmoothedScalar,
} from "./poseSmoothing";

/**
 * Alimenta um `SmoothedScalar` com um degrau constante por `n = round(totalSeconds / dtSeconds)`
 * passos de `dtSeconds` cada, partindo de 0. `n` arredondado (nao ceil/floor) mantem o tempo
 * total real proximo do pedido para dt's diferentes, o que e o ponto do teste de frame rate:
 * comparar dois `dtSeconds` que cobrem QUASE o mesmo tempo total.
 */
function runConstantStep(
  dtSeconds: number,
  totalSeconds: number,
  tauSeconds: number,
  target: number
): number {
  // Snap gigante: este teste e sobre a formula exponencial, nao sobre o snap.
  const smoothed = new SmoothedScalar(tauSeconds, 1e9);
  smoothed.push(0, 1);

  const steps = Math.round(totalSeconds / dtSeconds);

  for (let i = 0; i < steps; i++) {
    smoothed.push(target, dtSeconds);
  }

  return smoothed.current as number;
}

describe("SmoothedScalar", () => {
  it("primeiro push adota o valor cru direto", () => {
    const smoothed = new SmoothedScalar(0.15, 0.3);

    expect(smoothed.push(5, 0.016)).toBe(5);
    expect(smoothed.current).toBe(5);
  });

  it("e independente de frame rate: 16ms e 33ms convergem para o mesmo valor em ~0.3s", () => {
    // Motivo de existir a formula alpha = 1 - exp(-dt/tau): compor o filtro em
    // passos pequenos ou grandes, cobrindo o MESMO tempo real, tem que dar o
    // mesmo resultado. Um alpha fixo por frame (ex: 0.1) NAO teria essa
    // propriedade — filtraria o dobro de vezes a 60fps que a 30fps.
    const target = 1;
    const v16 = runConstantStep(0.016, 0.3, 0.15, target);
    const v33 = runConstantStep(0.033, 0.3, 0.15, target);

    expect(Math.abs(v16 - v33)).toBeLessThan(0.01 * target);
    // E os dois tem que estar de fato convergindo para o alvo, nao estagnados.
    expect(v16).toBeGreaterThan(0.8);
    expect(v33).toBeGreaterThan(0.8);
  });

  it("filtra ruido: media converge e a amplitude de saida cai bem abaixo da de entrada", () => {
    const smoothed = new SmoothedScalar(0.12, 1e9);
    const outputs: number[] = [];

    for (let i = 0; i < 200; i++) {
      const noisy = 10 + (i % 2 === 0 ? 0.05 : -0.05);
      outputs.push(smoothed.push(noisy, 0.03));
    }

    const tail = outputs.slice(-40);
    const tailMax = Math.max(...tail);
    const tailMin = Math.min(...tail);

    expect(smoothed.current).toBeCloseTo(10, 1);
    // Entrada oscila 0.1 de pico a pico; a saida filtrada tem que ser bem menor.
    expect(tailMax - tailMin).toBeLessThan(0.02);
  });

  it("snap: um salto >= limiar e adotado sem suavizar", () => {
    const smoothed = new SmoothedScalar(ORIGIN_TAU_SECONDS, ORIGIN_SNAP_M);

    smoothed.push(0, 1);
    const result = smoothed.push(0.4, 0.016); // 0.4m >= 0.30m de limiar

    expect(result).toBe(0.4);
    expect(smoothed.current).toBe(0.4);
  });

  it("abaixo do limiar, o salto e suavizado (nao adota o valor cru de uma vez)", () => {
    const smoothed = new SmoothedScalar(ORIGIN_TAU_SECONDS, ORIGIN_SNAP_M);

    smoothed.push(0, 1);
    const result = smoothed.push(0.2, 0.016); // 0.2m < 0.30m de limiar

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(0.2);
  });

  it("reset() faz o proximo push adotar o valor cru direto", () => {
    const smoothed = new SmoothedScalar(0.15, 0.3);

    smoothed.push(0, 1);
    smoothed.push(0.1, 0.016);
    smoothed.reset();

    expect(smoothed.current).toBeNull();
    expect(smoothed.push(9, 0.016)).toBe(9);
  });

  it("dt invalido (<=0 ou nao finito) nao altera current", () => {
    const smoothed = new SmoothedScalar(0.15, 0.3);

    smoothed.push(5, 1);
    expect(smoothed.push(5.5, 0)).toBe(5);
    expect(smoothed.current).toBe(5);

    expect(smoothed.push(5.5, NaN)).toBe(5);
    expect(smoothed.current).toBe(5);

    expect(smoothed.push(5.5, -0.01)).toBe(5);
    expect(smoothed.current).toBe(5);
  });
});

describe("SmoothedAngleDeg", () => {
  it("primeiro push adota o valor cru, ja normalizado", () => {
    const smoothed = new SmoothedAngleDeg(0.12, 25);

    expect(smoothed.push(350, 0.016)).toBeCloseTo(-10);
  });

  it("e independente de frame rate, como SmoothedScalar", () => {
    const target = 40;
    const mk = (dt: number) => {
      const s = new SmoothedAngleDeg(0.15, 1e9);
      s.push(0, 1);
      const steps = Math.round(0.3 / dt);
      for (let i = 0; i < steps; i++) {
        s.push(target, dt);
      }
      return s.current as number;
    };

    expect(Math.abs(mk(0.016) - mk(0.033))).toBeLessThan(0.4); // ~1% de 40
  });

  it("ruido de +-2 graus em torno de 40 converge para ~40 com amplitude reduzida", () => {
    const smoothed = new SmoothedAngleDeg(HEADING_TAU_SECONDS, HEADING_SNAP_DEG);
    const outputs: number[] = [];

    for (let i = 0; i < 200; i++) {
      const noisy = 40 + (i % 2 === 0 ? 2 : -2);
      outputs.push(smoothed.push(noisy, 0.03));
    }

    const tail = outputs.slice(-40);
    const tailMax = Math.max(...tail);
    const tailMin = Math.min(...tail);

    expect(smoothed.current).toBeCloseTo(40, 0);
    expect(tailMax - tailMin).toBeLessThan(1); // entrada oscila 4 de pico a pico
  });

  it("caminho curto: de 179 para -179 anda ~2 graus, nunca varre 358", () => {
    const smoothed = new SmoothedAngleDeg(0.15, 1e9);

    smoothed.push(179, 1);
    const afterOneStep = smoothed.push(-179, 0.016);

    // Se tivesse varrido o caminho longo, o valor logo apos o primeiro passo
    // estaria muito abaixo de 179 (indo em direcao a -179 pelo lado de 0).
    // Pelo caminho curto ele sobe (passando por 180/-180).
    expect(afterOneStep).toBeGreaterThan(179);

    // Convergindo (dt grande o bastante para praticamente terminar o passo).
    const converged = smoothed.push(-179, 5);
    expect(converged).toBeCloseTo(-179);
  });

  it("caminho curto no sentido inverso: de -179 para 179 anda ~2 graus", () => {
    const smoothed = new SmoothedAngleDeg(0.15, 1e9);

    smoothed.push(-179, 1);
    const afterOneStep = smoothed.push(179, 0.016);

    expect(afterOneStep).toBeLessThan(-179);

    const converged = smoothed.push(179, 5);
    expect(converged).toBeCloseTo(179);
  });

  it("snap: um salto de 40 graus e adotado sem suavizar; um de 10 graus e suavizado", () => {
    const snapping = new SmoothedAngleDeg(HEADING_TAU_SECONDS, HEADING_SNAP_DEG);
    snapping.push(0, 1);
    const snapped = snapping.push(40, 0.016);
    expect(snapped).toBe(40);

    const smoothing = new SmoothedAngleDeg(HEADING_TAU_SECONDS, HEADING_SNAP_DEG);
    smoothing.push(0, 1);
    const eased = smoothing.push(10, 0.016);
    expect(eased).toBeGreaterThan(0);
    expect(eased).toBeLessThan(10);
  });

  it("reset() faz o proximo push adotar o valor cru direto", () => {
    const smoothed = new SmoothedAngleDeg(0.12, 25);

    smoothed.push(0, 1);
    smoothed.push(5, 0.016);
    smoothed.reset();

    expect(smoothed.current).toBeNull();
    expect(smoothed.push(-90, 0.016)).toBe(-90);
  });

  it("dt invalido (<=0 ou nao finito) nao altera current", () => {
    const smoothed = new SmoothedAngleDeg(0.12, 25);

    smoothed.push(10, 1);
    expect(smoothed.push(15, 0)).toBe(10);
    expect(smoothed.push(15, NaN)).toBe(10);
    expect(smoothed.push(15, -1)).toBe(10);
  });

  it("saida sempre em (-180, +180], mesmo alimentada com 350 ou -400", () => {
    const smoothed = new SmoothedAngleDeg(0.12, 1e9);

    const r1 = smoothed.push(350, 1);
    expect(r1).toBeGreaterThan(-180);
    expect(r1).toBeLessThanOrEqual(180);

    smoothed.reset();
    const r2 = smoothed.push(-400, 1);
    expect(r2).toBeGreaterThan(-180);
    expect(r2).toBeLessThanOrEqual(180);

    // Varre uma sequencia atravessando a costura repetidas vezes e confere o
    // invariante em toda leitura, nao so na primeira.
    const sweeping = new SmoothedAngleDeg(0.12, 1e9);
    sweeping.push(170, 1);
    for (const raw of [190, -190, 350, -350, 720, -720, 175, -175]) {
      const result = sweeping.push(raw, 0.02);
      expect(result).toBeGreaterThan(-180);
      expect(result).toBeLessThanOrEqual(180);
    }
  });
});

describe("constantes de sintonia", () => {
  it("tem os valores do contrato", () => {
    expect(ORIGIN_TAU_SECONDS).toBe(0.15);
    expect(ORIGIN_SNAP_M).toBe(0.3);
    expect(HEADING_TAU_SECONDS).toBe(0.12);
    expect(HEADING_SNAP_DEG).toBe(25);
  });
});
