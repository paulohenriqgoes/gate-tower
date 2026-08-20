import { describe, expect, it } from "vitest";

import {
  ARENA_ARC_DEG,
  ARENA_RADIUS_M,
  DEVICE_FOV_DEG,
  MIN_PLACE_RADIUS_M,
  evaluatePlacement,
  framedSectors,
  pickSpawnSector,
  sectorCenterDeg,
  sectorOf,
  sectorRangeDeg,
  toArc,
  toLocal,
  type ArcPoint,
  type SectorId
} from "./ArenaArc";

const ALL_SECTORS: SectorId[] = ["left", "center", "right"];

/** Gerador determinístico de valores em [0,1), independente de Math.random. */
function seededRng(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe("toArc / toLocal — round trip", () => {
  it("frente exata: azimute 0 -> (0, +radius) -> azimute 0", () => {
    // O +Z, e nao o -Z. Este e o zero do azimute desde a spec 08: numa cena
    // canhota — a unica que este build do 8th Wall suporta — a frente da camera
    // com `facing` identidade e o +Z. Um marcador de azimute 0 colocado em -Z
    // nasce nas costas do jogador (medido em device, 2026-08-19).
    const p: ArcPoint = { azimuthDeg: 0, radiusM: 1.5 };
    const local = toLocal(p);
    expect(local.x).toBeCloseTo(0, 10);
    expect(local.z).toBeCloseTo(1.5, 10);

    const back = toArc(local);
    expect(back.azimuthDeg).toBeCloseTo(0, 10);
    expect(back.radiusM).toBeCloseTo(1.5, 10);
  });

  it("costas: azimute 180 -> (0, -radius)", () => {
    // O par do teste acima. Provar so a frente deixa passar uma convencao
    // espelhada; provar as costas fecha o zero pelos dois lados.
    const local = toLocal({ azimuthDeg: 180, radiusM: 1.5 });
    expect(local.x).toBeCloseTo(0, 10);
    expect(local.z).toBeCloseTo(-1.5, 10);
  });

  it("direita exata: azimute 90 -> (radius, 0) -> azimute 90", () => {
    const p: ArcPoint = { azimuthDeg: 90, radiusM: 2 };
    const local = toLocal(p);
    expect(local.x).toBeCloseTo(2, 10);
    expect(local.z).toBeCloseTo(0, 10);

    const back = toArc(local);
    expect(back.azimuthDeg).toBeCloseTo(90, 10);
    expect(back.radiusM).toBeCloseTo(2, 10);
  });

  it("esquerda exata: azimute -90 -> (-radius, 0) -> azimute -90", () => {
    const p: ArcPoint = { azimuthDeg: -90, radiusM: 2 };
    const local = toLocal(p);
    expect(local.x).toBeCloseTo(-2, 10);
    expect(local.z).toBeCloseTo(0, 10);

    const back = toArc(local);
    expect(back.azimuthDeg).toBeCloseTo(-90, 10);
    expect(back.radiusM).toBeCloseTo(2, 10);
  });

  it("round-trip em varios pontos arbitrarios (ArenaPoint2D -> ArcPoint -> ArenaPoint2D)", () => {
    const points = [
      { x: 0.3, z: 1.1 },
      { x: -0.8, z: 2.0 },
      { x: 1.9, z: 0.2 },
      { x: -1.4, z: 1.4 },
      { x: 0.05, z: 2.19 }
    ];

    for (const point of points) {
      const arc = toArc(point);
      const back = toLocal(arc);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.z).toBeCloseTo(point.z, 9);
    }
  });

  it("round-trip em varios pontos arbitrarios (ArcPoint -> ArenaPoint2D -> ArcPoint)", () => {
    const arcs: ArcPoint[] = [
      { azimuthDeg: 12, radiusM: 1.2 },
      { azimuthDeg: -45, radiusM: 2.0 },
      { azimuthDeg: 89.9, radiusM: 0.95 },
      { azimuthDeg: -89.9, radiusM: 2.2 },
      { azimuthDeg: 0.01, radiusM: 1.0 }
    ];

    for (const arc of arcs) {
      const local = toLocal(arc);
      const back = toArc(local);
      expect(back.azimuthDeg).toBeCloseTo(arc.azimuthDeg, 9);
      expect(back.radiusM).toBeCloseTo(arc.radiusM, 9);
    }
  });
});

describe("sectorOf — arco padrao (180)", () => {
  it("fronteiras exatas: -90 left, -30 center, 30 right, 90 right", () => {
    expect(sectorOf(-90)).toBe("left");
    expect(sectorOf(-30)).toBe("center");
    expect(sectorOf(30)).toBe("right");
    expect(sectorOf(90)).toBe("right");
  });

  it("fora do arco devolve null", () => {
    expect(sectorOf(90.1)).toBeNull();
    expect(sectorOf(-90.1)).toBeNull();
    expect(sectorOf(180)).toBeNull();
    expect(sectorOf(-180)).toBeNull();
  });

  it("pontos internos de cada setor", () => {
    expect(sectorOf(-60)).toBe("left");
    expect(sectorOf(0)).toBe("center");
    expect(sectorOf(60)).toBe("right");
  });

  it("cobertura sem buraco: todo angulo de -90 a 90 cai em exatamente um setor", () => {
    for (let az = -90; az <= 90; az += 0.25) {
      const sector = sectorOf(az);
      expect(sector).not.toBeNull();
      expect(ALL_SECTORS).toContain(sector);
    }
  });
});

describe("sectorOf — arco de 120 (parametrizavel)", () => {
  const ARC = 120;

  it("fronteiras exatas: -60 left, -20 center, 20 right, 60 right", () => {
    expect(sectorOf(-60, ARC)).toBe("left");
    expect(sectorOf(-20, ARC)).toBe("center");
    expect(sectorOf(20, ARC)).toBe("right");
    expect(sectorOf(60, ARC)).toBe("right");
  });

  it("fora do arco devolve null", () => {
    expect(sectorOf(60.1, ARC)).toBeNull();
    expect(sectorOf(-60.1, ARC)).toBeNull();
    expect(sectorOf(180, ARC)).toBeNull();
  });

  it("cobertura sem buraco: todo angulo de -60 a 60 cai em exatamente um setor", () => {
    for (let az = -60; az <= 60; az += 0.25) {
      const sector = sectorOf(az, ARC);
      expect(sector).not.toBeNull();
      expect(ALL_SECTORS).toContain(sector);
    }
  });

  it("trocar ARENA_ARC_DEG para 120 nao muda a constante publica (e o design fica testavel sem gambiarra)", () => {
    // Este teste documenta a garantia: a constante publica exportada continua
    // 180; a variante de 120 e exercida so via parametro opcional de sectorOf.
    expect(ARENA_ARC_DEG).toBe(180);
  });
});

describe("sectorRangeDeg / sectorCenterDeg", () => {
  it("arco padrao (180): ranges e centros esperados", () => {
    expect(sectorRangeDeg("left")).toEqual([-90, -30]);
    expect(sectorRangeDeg("center")).toEqual([-30, 30]);
    expect(sectorRangeDeg("right")).toEqual([30, 90]);

    expect(sectorCenterDeg("left")).toBe(-60);
    expect(sectorCenterDeg("center")).toBe(0);
    expect(sectorCenterDeg("right")).toBe(60);
  });

  it("arco de 120: ranges e centros recalculados", () => {
    expect(sectorRangeDeg("left", 120)).toEqual([-60, -20]);
    expect(sectorRangeDeg("center", 120)).toEqual([-20, 20]);
    expect(sectorRangeDeg("right", 120)).toEqual([20, 60]);

    expect(sectorCenterDeg("left", 120)).toBe(-40);
    expect(sectorCenterDeg("center", 120)).toBe(0);
    expect(sectorCenterDeg("right", 120)).toBe(40);
  });
});

describe("evaluatePlacement", () => {
  it("ok: dentro do arco e do raio valido", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: 1.5 })).toEqual({ ok: true });
  });

  it("ok nas bordas exatas do raio (MIN_PLACE_RADIUS_M e ARENA_RADIUS_M sao inclusivos)", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: MIN_PLACE_RADIUS_M })).toEqual({ ok: true });
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: ARENA_RADIUS_M })).toEqual({ ok: true });
  });

  it("fora-do-arco quando o azimute cai fora do arco", () => {
    expect(evaluatePlacement({ azimuthDeg: 120, radiusM: 1.5 })).toEqual({
      ok: false,
      reason: "fora-do-arco"
    });
  });

  it("perto-demais quando o raio e menor que MIN_PLACE_RADIUS_M", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: MIN_PLACE_RADIUS_M - 0.01 })).toEqual({
      ok: false,
      reason: "perto-demais"
    });
  });

  it("longe-demais quando o raio e maior que ARENA_RADIUS_M", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: ARENA_RADIUS_M + 0.01 })).toEqual({
      ok: false,
      reason: "longe-demais"
    });
  });

  it("ordem deterministica de recusa: fora-do-arco vence mesmo com raio tambem invalido", () => {
    // azimute fora do arco E raio perto demais ao mesmo tempo -> fora-do-arco
    // vem primeiro, por definicao (ver comentario em evaluatePlacement).
    expect(evaluatePlacement({ azimuthDeg: 150, radiusM: 0.1 })).toEqual({
      ok: false,
      reason: "fora-do-arco"
    });
  });
});

describe("framedSectors", () => {
  it("yaw 0 com FOV padrao (60): so o setor central e enquadrado com area", () => {
    expect(framedSectors(0)).toEqual(["center"]);
  });

  it("yaw 60 (olhando pro limite direito): so o setor direito", () => {
    expect(framedSectors(60)).toEqual(["right"]);
  });

  it("yaw -60 (olhando pro limite esquerdo): so o setor esquerdo", () => {
    expect(framedSectors(-60)).toEqual(["left"]);
  });

  it("yaw 180 (de costas pro arco): vazio", () => {
    expect(framedSectors(180)).toEqual([]);
  });

  it("yaw entre dois setores enquadra os dois, mas nao o terceiro", () => {
    const result = framedSectors(30);
    expect(result).toContain("center");
    expect(result).toContain("right");
    expect(result).not.toContain("left");
  });

  it("normaliza wrap de angulo: yaw 360 se comporta como yaw 0", () => {
    expect(framedSectors(360)).toEqual(["center"]);
  });

  it("normaliza wrap de angulo: yaw -300 se comporta como yaw 60", () => {
    expect(framedSectors(-300)).toEqual(["right"]);
  });

  it("fovDeg customizado: cone bem largo enquadra todos os setores", () => {
    expect(framedSectors(0, 200)).toEqual(["left", "center", "right"]);
  });

  it("usa DEVICE_FOV_DEG como default", () => {
    expect(framedSectors(0)).toEqual(framedSectors(0, DEVICE_FOV_DEG));
  });
});

describe("pickSpawnSector", () => {
  const rngSeeds = [1, 2, 3, 7, 42, 1000];
  const yaws = [-90, -75, -60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60, 75, 90, 120, 180, -180];

  it("nunca devolve um setor enquadrado enquanto houver setor livre (varrendo yaws e rngs)", () => {
    for (const yaw of yaws) {
      const framed = new Set(framedSectors(yaw));
      const hasFreeSector = ALL_SECTORS.some((s) => !framed.has(s));

      for (const seed of rngSeeds) {
        const rng = seededRng(seed);
        const picked = pickSpawnSector(yaw, rng);
        expect(ALL_SECTORS).toContain(picked);

        if (hasFreeSector) {
          expect(framed.has(picked)).toBe(false);
        }
      }
    }
  });

  it("varre tambem valores de rng constantes cobrindo [0,1)", () => {
    const constantRngs = [0, 0.1, 0.33, 0.5, 0.66, 0.75, 0.99, 0.999999];

    for (const yaw of yaws) {
      const framed = new Set(framedSectors(yaw));
      const hasFreeSector = ALL_SECTORS.some((s) => !framed.has(s));

      for (const value of constantRngs) {
        const picked = pickSpawnSector(yaw, () => value);
        expect(ALL_SECTORS).toContain(picked);

        if (hasFreeSector) {
          expect(framed.has(picked)).toBe(false);
        }
      }
    }
  });

  it("caso degenerado: todos os setores enquadrados (fovDeg grande) ainda devolve um setor valido", () => {
    for (const seed of rngSeeds) {
      const rng = seededRng(seed);
      const picked = pickSpawnSector(0, rng, 200);
      expect(ALL_SECTORS).toContain(picked);
    }

    // rng nos extremos do intervalo [0,1) tambem nao pode estourar indice.
    expect(ALL_SECTORS).toContain(pickSpawnSector(0, () => 0, 200));
    expect(ALL_SECTORS).toContain(pickSpawnSector(0, () => 0.999999, 200));
  });

  it("com um unico setor livre, devolve sempre esse setor (nao ha sorteio real a fazer)", () => {
    // yaw 60: framedSectors(60) = ["right"], sobram left e center livres —
    // ja coberto acima. Aqui forcamos so um livre com fovDeg maior.
    const framed = framedSectors(30, 100);
    const free = ALL_SECTORS.filter((s) => !framed.includes(s));
    expect(free.length).toBe(1);

    for (const value of [0, 0.4, 0.9999]) {
      expect(pickSpawnSector(30, () => value, 100)).toBe(free[0]);
    }
  });
});
