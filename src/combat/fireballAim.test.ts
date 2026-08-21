import { describe, expect, it } from "vitest";

import { sectorCenterDeg, type ArcPoint } from "../arena/ArenaArc";
import { FIREBALL_AIM_CONE_DEG } from "../arena/metrics";
import { pickFireballTarget } from "./fireballAim";

const CONE = FIREBALL_AIM_CONE_DEG;

describe("pickFireballTarget", () => {
  it("sem ninguem no cone, o tiro nao acerta nada", () => {
    const candidates: ArcPoint[] = [{ azimuthDeg: 25, radiusM: 1.2 }];

    expect(pickFireballTarget(-25, candidates, CONE)).toBeNull();
  });

  it("lista vazia nao acerta nada (nao estoura indice)", () => {
    expect(pickFireballTarget(0, [], CONE)).toBeNull();
  });

  it("acerta quem esta dentro do cone", () => {
    const candidates: ArcPoint[] = [{ azimuthDeg: 1, radiusM: 1.4 }];

    expect(pickFireballTarget(0, candidates, CONE)).toBe(0);
  });

  it("perdoa tremor de mao, mas nao perdoa o flanco errado", () => {
    // Um alvo a meio cone da mira e acertado; o mesmo alvo com a mira no centro
    // do flanco vizinho, nao. E a linha que separa "a mao tremeu" de "voce
    // apontou para o outro lado".
    const candidates: ArcPoint[] = [{ azimuthDeg: 0, radiusM: 1.5 }];

    expect(pickFireballTarget(CONE / 2 - 0.01, candidates, CONE)).toBe(0);
    expect(pickFireballTarget(sectorCenterDeg("right"), candidates, CONE)).toBeNull();
  });

  it("a borda do cone e inclusiva, dos dois lados", () => {
    const candidates: ArcPoint[] = [{ azimuthDeg: 0, radiusM: 1.5 }];

    expect(pickFireballTarget(CONE / 2, candidates, CONE)).toBe(0);
    expect(pickFireballTarget(-CONE / 2, candidates, CONE)).toBe(0);
    expect(pickFireballTarget(CONE / 2 + 0.01, candidates, CONE)).toBeNull();
  });

  it("com varios no cone, acerta o MAIS PERTO do jogador", () => {
    const candidates: ArcPoint[] = [
      { azimuthDeg: 0.5, radiusM: 1.7 },
      { azimuthDeg: -0.5, radiusM: 0.8 },
      { azimuthDeg: 0, radiusM: 1.2 },
    ];

    // Nao o mais alinhado com a mira (indice 2, azimute exato) nem o primeiro
    // da lista: o mais proximo. A fireball responde a quem ja chegou.
    expect(pickFireballTarget(0, candidates, CONE)).toBe(1);
  });

  it("empate exato de raio resolve pelo primeiro da lista, de forma estavel", () => {
    const candidates: ArcPoint[] = [
      { azimuthDeg: 1, radiusM: 1.2 },
      { azimuthDeg: -1, radiusM: 1.2 },
    ];

    expect(pickFireballTarget(0, candidates, CONE)).toBe(0);
  });

  it("ignora quem esta fora do cone mesmo estando muito mais perto", () => {
    const candidates: ArcPoint[] = [
      { azimuthDeg: sectorCenterDeg("left"), radiusM: 0.6 },
      { azimuthDeg: 0, radiusM: 1.7 },
    ];

    // O de 0,6 m e o mais perto, mas esta no flanco que a mira nao cobre —
    // exatamente a situacao em que o jogador precisa girar em vez de atirar.
    expect(pickFireballTarget(0, candidates, CONE)).toBe(1);
  });

  it("nao e enganado pelo wrap de angulo: mira em 179 acerta alvo em -179", () => {
    // Fora da arena de hoje, mas a aritmetica de angulo tem de estar certa
    // independentemente do arco — foi um wrap mal tratado que ja custou um bug
    // de azimute invertido em 180 graus neste projeto.
    const candidates: ArcPoint[] = [{ azimuthDeg: -179, radiusM: 1.2 }];

    expect(pickFireballTarget(179, candidates, CONE)).toBe(0);
  });
});
