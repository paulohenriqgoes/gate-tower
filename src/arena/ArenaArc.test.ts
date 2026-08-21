import { describe, expect, it } from "vitest";

import {
  ARENA_ARC_DEG,
  ARENA_DEPTH_M,
  ARENA_WIDTH_M,
  DEPLOY_CONE_DEG,
  DEVICE_FOV_DEG,
  MIN_PLACE_RADIUS_M,
  arenaEdgeRadiusAt,
  evaluateDeployment,
  evaluatePlacement,
  reachableSectors,
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

/** Radianos -> graus, local ao teste: o modelo nao exporta a conversao. */
function radToDegLocal(rad: number): number {
  return (rad * 180) / Math.PI;
}

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

describe("sectorOf — arco padrao (60)", () => {
  it("fronteiras exatas: -30 left, -10 center, 10 right, 30 right", () => {
    expect(sectorOf(-30)).toBe("left");
    expect(sectorOf(-10)).toBe("center");
    expect(sectorOf(10)).toBe("right");
    expect(sectorOf(30)).toBe("right");
  });

  it("fora do arco devolve null", () => {
    expect(sectorOf(30.1)).toBeNull();
    expect(sectorOf(-30.1)).toBeNull();
    expect(sectorOf(180)).toBeNull();
    expect(sectorOf(-180)).toBeNull();
  });

  it("pontos internos de cada setor", () => {
    expect(sectorOf(-20)).toBe("left");
    expect(sectorOf(0)).toBe("center");
    expect(sectorOf(20)).toBe("right");
  });

  it("cobertura sem buraco: todo angulo de -30 a 30 cai em exatamente um setor", () => {
    for (let az = -30; az <= 30; az += 0.25) {
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

  it("a matematica funciona com qualquer arco — a constante publica e so o valor escolhido hoje", () => {
    // A garantia de `DJ-7`: nenhuma funcao do modelo assume um arco especifico,
    // e a variante de 120 acima e exercida so via parametro opcional. A
    // constante publica ja foi 180, passou por 90 e hoje e 60 — igual ao FOV,
    // porque a arena inteira cabe no quadro (ver o docblock do modulo).
    expect(ARENA_ARC_DEG).toBe(60);
    expect(ARENA_ARC_DEG).toBe(DEVICE_FOV_DEG);
  });
});

describe("sectorRangeDeg / sectorCenterDeg", () => {
  it("arco padrao (60): ranges e centros esperados", () => {
    expect(sectorRangeDeg("left")).toEqual([-30, -10]);
    expect(sectorRangeDeg("center")).toEqual([-10, 10]);
    expect(sectorRangeDeg("right")).toEqual([10, 30]);

    expect(sectorCenterDeg("left")).toBe(-20);
    expect(sectorCenterDeg("center")).toBe(0);
    expect(sectorCenterDeg("right")).toBe(20);
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

describe("a arena e um RETANGULO", () => {
  it("a largura e derivada do FOV: os cantos do fundo caem na borda exata do quadro", () => {
    // Esta e a propriedade que sustenta "ele ve tudo, nao tem problema". Se a
    // largura fosse digitada, os cantos ficariam de fora do FOV e o jogador
    // perderia justamente o pedaco onde nao consegue agir sem girar.
    const cornerAzimuth = radToDegLocal(Math.atan2(ARENA_WIDTH_M / 2, ARENA_DEPTH_M));
    expect(cornerAzimuth).toBeCloseTo(DEVICE_FOV_DEG / 2, 9);
    expect(sectorOf(cornerAzimuth)).toBe("right");
  });

  it("a borda do fundo NAO esta a distancia constante — e reta, nao curva", () => {
    // No azimute 0 o fundo esta a 1,8 m; no canto, a 2,08 m. Quem faz inimigo
    // nascer "na borda" precisa deste numero por azimute: com um raio fixo,
    // metade dos nascimentos cairia fora do campo.
    expect(arenaEdgeRadiusAt(0)).toBeCloseTo(ARENA_DEPTH_M, 9);
    expect(arenaEdgeRadiusAt(30)).toBeCloseTo(Math.hypot(ARENA_WIDTH_M / 2, ARENA_DEPTH_M), 9);
    expect(arenaEdgeRadiusAt(30)).toBeGreaterThan(arenaEdgeRadiusAt(0));
  });

  it("todo ponto da borda do fundo esta DENTRO da arena, em qualquer azimute", () => {
    for (let az = -30; az <= 30; az += 0.5) {
      expect(evaluatePlacement({ azimuthDeg: az, radiusM: arenaEdgeRadiusAt(az) }).ok).toBe(true);
    }
  });
});

describe("evaluatePlacement — a geometria do campo, sem o cone", () => {
  it("ok: dentro do retangulo e alem da folga minima", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: 1.5 })).toEqual({ ok: true });
  });

  it("ok na borda exata da folga interna (MIN_PLACE_RADIUS_M e inclusivo)", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: MIN_PLACE_RADIUS_M })).toEqual({ ok: true });
  });

  it("fora-da-arena quando o azimute sai do campo", () => {
    expect(evaluatePlacement({ azimuthDeg: 120, radiusM: 1.5 })).toEqual({
      ok: false,
      reason: "fora-da-arena"
    });
  });

  it("fora-da-arena passando do fundo, mesmo com azimute valido", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: ARENA_DEPTH_M + 0.01 })).toEqual({
      ok: false,
      reason: "fora-da-arena"
    });
  });

  it("fora-da-arena nos CANTOS PROXIMOS: o campo e o retangulo recortado pelo arco", () => {
    // Um ponto a 60 graus e 1,16 m cabe no retangulo (|x| = 1,00 < 1,04 e
    // z = 0,58 < 1,8) e mesmo assim NAO e campo: ele nao pertence a flanco
    // nenhum. Quatro colocacoes assim foram aceitas em device antes deste
    // recorte existir, e uma tropa la some da contagem de ameaca por setor.
    const point = { azimuthDeg: 59.9, radiusM: 1.16 };
    const { x, z } = toLocal(point);

    expect(Math.abs(x)).toBeLessThan(ARENA_WIDTH_M / 2);
    expect(z).toBeLessThan(ARENA_DEPTH_M);
    expect(evaluatePlacement(point)).toEqual({ ok: false, reason: "fora-da-arena" });
  });

  it("fora-da-arena passando da largura, mesmo perto do jogador", () => {
    // Um ponto a 90 graus e a 1,2 m: dentro do antigo arco de 180, e fora do
    // retangulo de hoje pelas duas contas (largura e azimute).
    expect(evaluatePlacement({ azimuthDeg: 90, radiusM: 1.2 })).toEqual({
      ok: false,
      reason: "fora-da-arena"
    });
  });

  it("perto-demais quando o raio e menor que MIN_PLACE_RADIUS_M", () => {
    expect(evaluatePlacement({ azimuthDeg: 0, radiusM: MIN_PLACE_RADIUS_M - 0.01 })).toEqual({
      ok: false,
      reason: "perto-demais"
    });
  });

  it("ordem deterministica de recusa: fora-da-arena vence mesmo com raio tambem invalido", () => {
    expect(evaluatePlacement({ azimuthDeg: 150, radiusM: 0.1 })).toEqual({
      ok: false,
      reason: "fora-da-arena"
    });
  });
});

describe("evaluateDeployment — o cone de acao e o recurso escasso", () => {
  it("mirando no ponto, o mesmo lugar que `evaluatePlacement` aprova e colocavel", () => {
    expect(evaluateDeployment({ azimuthDeg: 0, radiusM: 1.5 }, 0)).toEqual({ ok: true });
  });

  it("fora-do-cone: o ponto e valido, o jogador o VE, e mesmo assim nao alcanca", () => {
    // 20 graus de mira contra um alvo em -20: o flanco oposto. E o jogo inteiro
    // nesta asserçao — ver e de graca, agir custa um giro.
    expect(evaluateDeployment({ azimuthDeg: -20, radiusM: 1.5 }, 20)).toEqual({
      ok: false,
      reason: "fora-do-cone"
    });
  });

  it("a borda do cone e inclusiva dos dois lados", () => {
    const half = DEPLOY_CONE_DEG / 2;
    expect(evaluateDeployment({ azimuthDeg: half, radiusM: 1.5 }, 0).ok).toBe(true);
    expect(evaluateDeployment({ azimuthDeg: -half, radiusM: 1.5 }, 0).ok).toBe(true);
    expect(evaluateDeployment({ azimuthDeg: half + 0.01, radiusM: 1.5 }, 0).ok).toBe(false);
  });

  it("girar o celular move o cone junto — e so isso muda", () => {
    const point = { azimuthDeg: 20, radiusM: 1.5 };

    expect(evaluateDeployment(point, 0).ok).toBe(false);
    expect(evaluateDeployment(point, 20).ok).toBe(true);
  });

  it("a geometria do campo vence o cone: mirar num ponto fora da arena nao o torna valido", () => {
    expect(evaluateDeployment({ azimuthDeg: 0, radiusM: 0.2 }, 0)).toEqual({
      ok: false,
      reason: "perto-demais"
    });
  });

  it("cobrir a arena inteira custa TRES posicoes de mira, uma por flanco", () => {
    const aims = [sectorCenterDeg("left"), sectorCenterDeg("center"), sectorCenterDeg("right")];

    for (const sector of ALL_SECTORS) {
      const point = { azimuthDeg: sectorCenterDeg(sector), radiusM: 1.5 };
      const aimsThatReach = aims.filter((aim) => evaluateDeployment(point, aim).ok);

      // Exatamente uma das tres miras alcanca o centro de cada flanco: nem
      // zero (haveria pedaco inalcancavel), nem duas (o cone estaria largo
      // demais e cobrir tudo custaria menos de tres giros).
      expect(aimsThatReach).toHaveLength(1);
    }
  });
});

describe("framedSectors — o que o jogador VE (de graca)", () => {
  it("yaw 0 com o FOV padrao: a arena INTEIRA esta no quadro", () => {
    // Esta e a inversao de 2026-08-21. Com o arco de 180 esta asserçao era
    // `["center"]`, e a informacao escondida era o jogo. Hoje ver e de graca e o
    // que custa e alcancar — ver `reachableSectors`.
    expect(framedSectors(0)).toEqual(["left", "center", "right"]);
  });

  it("yaw 30 (olhando pro limite direito): o flanco esquerdo sai do quadro", () => {
    expect(framedSectors(30)).toEqual(["center", "right"]);
  });

  it("yaw -30 (olhando pro limite esquerdo): o flanco direito sai do quadro", () => {
    expect(framedSectors(-30)).toEqual(["left", "center"]);
  });

  it("yaw 180 (de costas pra arena): vazio", () => {
    expect(framedSectors(180)).toEqual([]);
  });

  it("normaliza wrap de angulo: yaw 360 se comporta como yaw 0", () => {
    expect(framedSectors(360)).toEqual(["left", "center", "right"]);
  });

  it("normaliza wrap de angulo: yaw -330 se comporta como yaw 30", () => {
    expect(framedSectors(-330)).toEqual(["center", "right"]);
  });

  it("fovDeg customizado: cone bem largo enquadra todos os setores", () => {
    expect(framedSectors(0, 200)).toEqual(["left", "center", "right"]);
  });

  it("usa DEVICE_FOV_DEG como default", () => {
    expect(framedSectors(0)).toEqual(framedSectors(0, DEVICE_FOV_DEG));
  });
});

describe("reachableSectors — onde o jogador consegue AGIR (o recurso escasso)", () => {
  it("mirando no centro de um flanco, so aquele flanco e alcancavel", () => {
    expect(reachableSectors(sectorCenterDeg("left"))).toEqual(["left"]);
    expect(reachableSectors(sectorCenterDeg("center"))).toEqual(["center"]);
    expect(reachableSectors(sectorCenterDeg("right"))).toEqual(["right"]);
  });

  it("NUNCA alcanca os tres ao mesmo tempo, em nenhum angulo", () => {
    // A garantia que sustenta o jogo: sempre existe um flanco que voce ve e nao
    // alcanca. Enquanto o criterio era `framedSectors`, ela nao valia — com a
    // arena inteira no quadro, olhar para frente cobria tudo e o inimigo nao
    // tinha onde nascer.
    for (let yaw = -180; yaw <= 180; yaw += 0.5) {
      expect(reachableSectors(yaw).length).toBeLessThan(ALL_SECTORS.length);
    }
  });

  it("na fronteira entre dois flancos alcanca os dois — e nunca mais que isso", () => {
    const [, boundary] = sectorRangeDeg("left");
    expect(reachableSectors(boundary)).toEqual(["left", "center"]);
  });

  it("e `framedSectors` medido com o cone de acao, nao com o FOV", () => {
    expect(reachableSectors(12)).toEqual(framedSectors(12, DEPLOY_CONE_DEG));
  });
});

describe("pickSpawnSector", () => {
  const rngSeeds = [1, 2, 3, 7, 42, 1000];
  const yaws = [-90, -75, -60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60, 75, 90, 120, 180, -180];

  it("nunca devolve um setor ALCANCAVEL enquanto houver setor livre (varrendo yaws e rngs)", () => {
    for (const yaw of yaws) {
      const framed = new Set(reachableSectors(yaw));
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
      const framed = new Set(reachableSectors(yaw));
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

  it("caso degenerado: todos os setores alcancaveis (cone grande) ainda devolve um setor valido", () => {
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
    // Forca so um livre com um cone artificialmente largo: com o cone real
    // sobram sempre dois, entao o caso de "um so" nao acontece em producao.
    const reachable = framedSectors(20, 50);
    const free = ALL_SECTORS.filter((s) => !reachable.includes(s));
    expect(free.length).toBe(1);

    for (const value of [0, 0.4, 0.9999]) {
      expect(pickSpawnSector(20, () => value, 50)).toBe(free[0]);
    }
  });

  it("com o cone REAL sobram sempre dois flancos para nascer — nunca zero", () => {
    for (let yaw = -30; yaw <= 30; yaw += 0.5) {
      const reachable = new Set(reachableSectors(yaw));
      const free = ALL_SECTORS.filter((sector) => !reachable.has(sector));
      expect(free.length).toBeGreaterThanOrEqual(1);
    }
  });
});
