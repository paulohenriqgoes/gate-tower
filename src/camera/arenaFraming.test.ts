import { describe, it, expect } from "vitest";

import {
  cameraBasis,
  computeArenaCameraRadius,
  computeHudScreenOffset,
  dot,
  FRAMING_MARGIN,
  HUD_RIGHT_FRACTION,
  type Vec3Like,
} from "./arenaFraming";

// Arena do ArenaSystem: gridX 12 * tileSize 2 = 24 de largura (X) e
// gridZ 18 * tileSize 2 = 36 de comprimento (Z). Y cobre torres e barras.
const ARENA_HALF_EXTENTS: Vec3Like = { x: 12, y: 3, z: 18 };

// Camera principal de main.ts.
const ALPHA = -Math.PI / 2;
const BETA = Math.PI / 3.4;
const VERTICAL_FOV = 0.8;

const radiusFor = (
  width: number,
  height: number,
  hudRightFraction = HUD_RIGHT_FRACTION
): number =>
  computeArenaCameraRadius({
    alpha: ALPHA,
    aspectRatio: width / height,
    beta: BETA,
    halfExtents: ARENA_HALF_EXTENTS,
    hudRightFraction,
    margin: FRAMING_MARGIN,
    verticalFov: VERTICAL_FOV,
  });

/**
 * Projeta os 8 cantos da arena e confere se todos caem dentro do frustum util
 * (ja descontada a faixa do HUD) na distancia informada.
 */
function isArenaFullyVisible(
  radius: number,
  aspectRatio: number,
  hudRightFraction = HUD_RIGHT_FRACTION
): boolean {
  const { forward, right, up } = cameraBasis(ALPHA, BETA);
  const tanVertical = Math.tan(VERTICAL_FOV / 2);
  const tanHorizontal = tanVertical * aspectRatio * (1 - hudRightFraction);

  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const corner: Vec3Like = {
          x: signX * ARENA_HALF_EXTENTS.x,
          y: signY * ARENA_HALF_EXTENTS.y,
          z: signZ * ARENA_HALF_EXTENTS.z,
        };

        const depth = radius + dot(corner, forward);

        if (depth <= 0) {
          return false;
        }

        if (Math.abs(dot(corner, right)) > tanHorizontal * depth) {
          return false;
        }

        if (Math.abs(dot(corner, up)) > tanVertical * depth) {
          return false;
        }
      }
    }
  }

  return true;
}

const SCREEN_SIZES: Array<[number, number]> = [
  [844, 390], // celular em paisagem
  [390, 844], // celular em retrato
  [1920, 1080],
  [1024, 768],
  [320, 900], // tela extremamente estreita
];

describe("computeArenaCameraRadius", () => {
  it("mantem a arena inteira dentro do frustum em qualquer tela", () => {
    for (const [width, height] of SCREEN_SIZES) {
      const aspectRatio = width / height;

      expect(isArenaFullyVisible(radiusFor(width, height), aspectRatio)).toBe(true);
    }
  });

  it("nao deixa folga excessiva: sem a margem a arena ja encostaria na borda", () => {
    const aspectRatio = 844 / 390;
    const radiusSemMargem = radiusFor(844, 390) / FRAMING_MARGIN;

    expect(isArenaFullyVisible(radiusSemMargem * 0.97, aspectRatio)).toBe(false);
  });

  it("afasta mais a camera em retrato, ja que o FOV vertical e fixo", () => {
    // Com FOVMODE_VERTICAL_FIXED o FOV horizontal encolhe junto com a largura,
    // entao telas estreitas exigem mais distancia que as deitadas.
    expect(radiusFor(390, 844)).toBeGreaterThan(radiusFor(844, 390));
  });

  it("afasta a camera conforme a coluna de cartas ocupa mais largura", () => {
    expect(radiusFor(1280, 720, 0.35)).toBeGreaterThanOrEqual(radiusFor(1280, 720, 0));
  });

  it("nunca posiciona a camera dentro da propria arena", () => {
    const boundingRadius = Math.hypot(
      ARENA_HALF_EXTENTS.x,
      ARENA_HALF_EXTENTS.y,
      ARENA_HALF_EXTENTS.z
    );

    for (const [width, height] of SCREEN_SIZES) {
      expect(radiusFor(width, height)).toBeGreaterThanOrEqual(boundingRadius);
    }
  });

  it("produz valores finitos e positivos em telas degeneradas", () => {
    const radius = radiusFor(1, 10000);

    expect(Number.isFinite(radius)).toBe(true);
    expect(radius).toBeGreaterThan(0);
  });
});

describe("computeHudScreenOffset", () => {
  it("cresce com a distancia da camera e com a largura reservada ao HUD", () => {
    const base = computeHudScreenOffset(40, VERTICAL_FOV, 16 / 9, 0.22);

    expect(computeHudScreenOffset(80, VERTICAL_FOV, 16 / 9, 0.22)).toBeCloseTo(base * 2);
    expect(computeHudScreenOffset(40, VERTICAL_FOV, 16 / 9, 0.44)).toBeCloseTo(base * 2);
  });

  it("e zero quando nao ha HUD reservando espaco", () => {
    expect(computeHudScreenOffset(40, VERTICAL_FOV, 16 / 9, 0)).toBe(0);
  });
});

describe("cameraBasis", () => {
  it("devolve uma base ortonormal para a camera do jogo", () => {
    const { forward, right, up } = cameraBasis(ALPHA, BETA);

    for (const axis of [forward, right, up]) {
      expect(Math.hypot(axis.x, axis.y, axis.z)).toBeCloseTo(1);
    }

    expect(dot(forward, right)).toBeCloseTo(0);
    expect(dot(forward, up)).toBeCloseTo(0);
    expect(dot(right, up)).toBeCloseTo(0);
  });

  it("aponta a camera para baixo e para frente com o beta do jogo", () => {
    const { forward, up } = cameraBasis(ALPHA, BETA);

    // alpha = -PI/2 coloca a camera no lado -Z olhando para +Z, inclinada para baixo.
    expect(forward.z).toBeGreaterThan(0);
    expect(forward.y).toBeLessThan(0);
    expect(up.y).toBeGreaterThan(0);
  });
});
