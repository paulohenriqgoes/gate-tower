import { describe, expect, it } from "vitest";

import {
  arenaLocalToWorldOffset,
  arenaRootYawRad,
  forwardFromHeadingDeg,
  headingDegFromForward,
  normalizeAngleDeg,
  relativeYawDeg,
} from "./arenaHeading";
import { sectorOf, toLocal } from "../arena/ArenaArc";

/** Headings de teste cobrindo os quatro quadrantes e as fronteiras. */
const HEADINGS = [0, 17, 45, 90, 133, 180, -45, -90, -179];

describe("normalizeAngleDeg", () => {
  it("mantem o intervalo (-180, +180]", () => {
    for (const deg of [-720, -181, -180, -179, 0, 179, 180, 181, 540, 1234.5]) {
      const normalized = normalizeAngleDeg(deg);

      expect(normalized).toBeGreaterThan(-180);
      expect(normalized).toBeLessThanOrEqual(180);
    }
  });

  it("fecha +180 no lado positivo e -180 tambem", () => {
    // A ponta do intervalo e fechada em cima: os dois representam a mesma
    // direcao, e escolher um lado evita que o painel de debug pisque entre
    // -180 e +180 com o jogador parado de costas.
    expect(normalizeAngleDeg(180)).toBe(180);
    expect(normalizeAngleDeg(-180)).toBe(180);
  });

  it("preserva o angulo modulo 360", () => {
    for (const deg of HEADINGS) {
      expect(normalizeAngleDeg(deg + 360)).toBeCloseTo(normalizeAngleDeg(deg));
      expect(normalizeAngleDeg(deg - 360)).toBeCloseTo(normalizeAngleDeg(deg));
    }
  });
});

describe("headingDegFromForward", () => {
  it("le -Z do mundo como heading 0", () => {
    expect(headingDegFromForward(0, -1)).toBe(0);
  });

  it("cresce para a DIREITA do jogador (+X quando ele olha para -Z)", () => {
    // Numa cena destra a direita de `frente` e `cross(frente, cima)`; com
    // frente = (0,0,-1) e cima = (0,1,0) isso da +X. Se este teste inverter,
    // todo spawn "fora do quadro" nasce do lado errado.
    expect(headingDegFromForward(1, 0)).toBeCloseTo(90);
    expect(headingDegFromForward(-1, 0)).toBeCloseTo(-90);
    expect(headingDegFromForward(0, 1)).toBeCloseTo(180);
  });

  it("ignora o modulo do vetor", () => {
    expect(headingDegFromForward(3, -3)).toBeCloseTo(headingDegFromForward(0.1, -0.1));
  });

  it("e o inverso de forwardFromHeadingDeg", () => {
    for (const heading of HEADINGS) {
      const { x, z } = forwardFromHeadingDeg(heading);

      expect(headingDegFromForward(x, z)).toBeCloseTo(heading);
    }
  });

  it("devolve 0 (e nao NaN) para direcao horizontal degenerada", () => {
    expect(headingDegFromForward(0, 0)).toBe(0);
  });
});

describe("relativeYawDeg", () => {
  it("e zero quando a camera nao girou desde o fechamento", () => {
    for (const heading of HEADINGS) {
      expect(relativeYawDeg(heading, heading)).toBe(0);
    }
  });

  it("e POSITIVO quando o jogador gira para a direita", () => {
    // Fechou olhando para -Z; girou 40 graus para a direita (rumo a +X).
    expect(relativeYawDeg(40, 0)).toBeCloseTo(40);
    expect(relativeYawDeg(-40, 0)).toBeCloseTo(-40);
  });

  it("atravessa a costura de 180 sem saltar 360", () => {
    // Fechou olhando para +Z (heading 180) e girou um pouco para a direita.
    expect(relativeYawDeg(-170, 180)).toBeCloseTo(10);
    // ... e um pouco para a esquerda.
    expect(relativeYawDeg(170, 180)).toBeCloseTo(-10);
  });
});

describe("arenaRootYawRad", () => {
  it("faz o -Z LOCAL do root apontar para o heading do fechamento", () => {
    for (const heading of HEADINGS) {
      // O root leva o -Z local (0, 0, -1) para o mundo.
      const world = arenaLocalToWorldOffset(heading, 0, -1);
      const expected = forwardFromHeadingDeg(heading);

      expect(world.x).toBeCloseTo(expected.x);
      expect(world.z).toBeCloseTo(expected.z);
    }
  });

  it("e o NEGATIVO do heading em radianos", () => {
    expect(arenaRootYawRad(90)).toBeCloseTo(-Math.PI / 2);
    expect(arenaRootYawRad(-90)).toBeCloseTo(Math.PI / 2);
  });
});

describe("azimute da arena x heading do mundo", () => {
  it("um azimute da arena vira o heading do fechamento SOMADO a ele", () => {
    // Este e o invariante que amarra `ArenaArc` a este arquivo: mandar uma
    // tropa para o azimute `a` com a arena fechada no heading `h` tem que
    // coloca-la na direcao de mundo `h + a`.
    for (const heading of HEADINGS) {
      for (const azimuth of [-90, -60, -30, 0, 30, 60, 90]) {
        const local = toLocal({ azimuthDeg: azimuth, radiusM: 2.2 });
        const world = arenaLocalToWorldOffset(heading, local.x, local.z);

        expect(headingDegFromForward(world.x, world.z)).toBeCloseTo(
          normalizeAngleDeg(heading + azimuth)
        );
      }
    }
  });

  it("o setor da DIREITA fica mesmo a direita do jogador", () => {
    // Fechou olhando para -Z. O setor `right` cobre [30, 90].
    expect(sectorOf(60)).toBe("right");

    const local = toLocal({ azimuthDeg: 60, radiusM: 2 });
    const world = arenaLocalToWorldOffset(0, local.x, local.z);

    // Jogador olhando para -Z: a direita dele e +X.
    expect(world.x).toBeGreaterThan(0);
  });

  it("o setor da ESQUERDA fica mesmo a esquerda do jogador", () => {
    expect(sectorOf(-60)).toBe("left");

    const local = toLocal({ azimuthDeg: -60, radiusM: 2 });
    const world = arenaLocalToWorldOffset(0, local.x, local.z);

    expect(world.x).toBeLessThan(0);
  });

  it("o setor CENTRAL fica a frente, seja qual for o heading", () => {
    for (const heading of HEADINGS) {
      const local = toLocal({ azimuthDeg: 0, radiusM: 2 });
      const world = arenaLocalToWorldOffset(heading, local.x, local.z);
      const forward = forwardFromHeadingDeg(heading);

      // Produto escalar positivo = esta na frente de quem fechou a arena.
      expect(world.x * forward.x + world.z * forward.z).toBeGreaterThan(0);
    }
  });
});
