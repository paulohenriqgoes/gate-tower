import { describe, it, expect } from "vitest";

import {
  cameraBasis,
  computeArenaCameraRadius,
  computeHudVerticalOffset,
  dot,
  FRAMING_MARGIN,
  HUD_BOTTOM_FRACTION,
  type Vec3Like,
} from "./arenaFraming";

// Arena do ArenaSystem (Etapa 2, quadrado provisorio): gridX 8 * tileSize
// 0,55 = 4,4 m de largura (X) e gridZ 8 * tileSize 0,55 = 4,4 m de
// comprimento (Z) — meios-eixos de 2,2 m. Y cobre torres e barras; mantem a
// MESMA razao Y/X de antes (3/8 = 0,375) escalada para o novo tamanho de
// campo, ja que nunca foi derivado de uma formula estrita — so precisa
// continuar cobrindo confortavelmente `TOWER_HEIGHT_M` (1,20 m) mais a barra
// de vida. Estes numeros ja sao METROS diretos (1 unidade do Babylon = 1
// metro, `src/arena/metrics.ts`, nos dois modos de renderizacao) — nao ha
// mais conversao a fazer para medir o que a camera do modo tela enquadra.
const ARENA_HALF_EXTENTS: Vec3Like = { x: 2.2, y: 0.825, z: 2.2 };

// Camera principal de main.ts.
const ALPHA = -Math.PI / 2;
const BETA = Math.PI / 3.4;
const VERTICAL_FOV = 0.8;

const radiusFor = (
  width: number,
  height: number,
  hudBottomFraction = HUD_BOTTOM_FRACTION
): number =>
  computeArenaCameraRadius({
    alpha: ALPHA,
    aspectRatio: width / height,
    beta: BETA,
    halfExtents: ARENA_HALF_EXTENTS,
    hudBottomFraction,
    margin: FRAMING_MARGIN,
    verticalFov: VERTICAL_FOV,
  });

/**
 * Projeta os 8 cantos da arena e confere se todos caem dentro do frustum util
 * (ja descontado o terco inferior do HUD do FOV vertical) na distancia informada.
 */
function isArenaFullyVisible(
  radius: number,
  aspectRatio: number,
  hudBottomFraction = HUD_BOTTOM_FRACTION
): boolean {
  const { forward, right, up } = cameraBasis(ALPHA, BETA);
  const tanVertical = Math.tan(VERTICAL_FOV / 2);
  const tanVerticalUtil = tanVertical * (1 - hudBottomFraction);
  const tanHorizontal = tanVertical * aspectRatio;

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

        if (Math.abs(dot(corner, up)) > tanVerticalUtil * depth) {
          return false;
        }
      }
    }
  }

  return true;
}

// Paisagem saiu de escopo (retrato travado, ver spec da demo); mantemos so
// tamanhos de retrato reais + um extremo estreito. O caso verdadeiramente
// degenerado (largura ~1px) fica de fora desta lista de proposito: o piso de
// seguranca `safeAspect = max(aspectRatio, 0.01)` do proprio codigo de
// producao clampa aspect ratios patologicos so para garantir um resultado
// finito, abrindo mao da garantia de "arena inteira visivel" nesse extremo —
// e testado separadamente abaixo, em "produz valores finitos e positivos".
const SCREEN_SIZES: Array<[number, number]> = [
  [390, 844], // celular em retrato
  [428, 926], // celular grande em retrato
  [360, 780], // celular compacto em retrato
  [280, 1000], // retrato extremamente estreito (ainda acima do piso de safeAspect)
];

describe("computeArenaCameraRadius", () => {
  it("mantem a arena inteira dentro do frustum em qualquer tela retrato", () => {
    for (const [width, height] of SCREEN_SIZES) {
      const aspectRatio = width / height;

      expect(isArenaFullyVisible(radiusFor(width, height), aspectRatio)).toBe(true);
    }
  });

  it("nao deixa folga excessiva: sem a margem a arena ja encostaria na borda", () => {
    const aspectRatio = 390 / 844;
    const radiusSemMargem = radiusFor(390, 844) / FRAMING_MARGIN;

    expect(isArenaFullyVisible(radiusSemMargem * 0.97, aspectRatio)).toBe(false);
  });

  it("afasta mais a camera em telas mais estreitas, ja que o FOV vertical e fixo", () => {
    // Com FOVMODE_VERTICAL_FIXED o FOV horizontal encolhe junto com a largura,
    // entao telas mais estreitas exigem mais distancia.
    expect(radiusFor(360, 780)).toBeGreaterThan(radiusFor(428, 926));
  });

  it("afasta a camera conforme o HUD ocupa mais altura", () => {
    expect(radiusFor(390, 844, 0.45)).toBeGreaterThanOrEqual(radiusFor(390, 844, 0));
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

describe("computeHudVerticalOffset", () => {
  it("cresce com a distancia da camera e com a altura reservada ao HUD", () => {
    const base = computeHudVerticalOffset(40, VERTICAL_FOV, 0.32);

    expect(computeHudVerticalOffset(80, VERTICAL_FOV, 0.32)).toBeCloseTo(base * 2);
    expect(computeHudVerticalOffset(40, VERTICAL_FOV, 0.64)).toBeCloseTo(base * 2);
  });

  it("e zero quando nao ha HUD reservando espaco", () => {
    expect(computeHudVerticalOffset(40, VERTICAL_FOV, 0)).toBe(0);
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
