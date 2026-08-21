import { describe, expect, it } from "vitest";

import { sectorCenterDeg } from "../arena/ArenaArc";
import { summarizeSectorThreats } from "./sectorThreats";

describe("summarizeSectorThreats", () => {
  it("devolve os tres setores mesmo sem nenhuma ameaca", () => {
    const threats = summarizeSectorThreats([]);

    expect(threats.map((threat) => threat.sector)).toEqual(["left", "center", "right"]);
    expect(threats.every((threat) => threat.count === 0)).toBe(true);
    expect(threats.every((threat) => threat.nearestRadiusM === Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("conta por setor", () => {
    const threats = summarizeSectorThreats([
      { azimuthDeg: sectorCenterDeg("left"), radiusM: 2 },
      { azimuthDeg: sectorCenterDeg("left"), radiusM: 1.5 },
      { azimuthDeg: sectorCenterDeg("right"), radiusM: 2.1 },
    ]);

    expect(threats.find((threat) => threat.sector === "left")?.count).toBe(2);
    expect(threats.find((threat) => threat.sector === "center")?.count).toBe(0);
    expect(threats.find((threat) => threat.sector === "right")?.count).toBe(1);
  });

  it("nearestRadiusM e o MENOR raio do setor (o mais perto do jogador)", () => {
    const threats = summarizeSectorThreats([
      { azimuthDeg: sectorCenterDeg("center"), radiusM: 2.2 },
      { azimuthDeg: sectorCenterDeg("center"), radiusM: 0.95 },
      { azimuthDeg: sectorCenterDeg("center"), radiusM: 1.7 },
    ]);

    expect(threats.find((threat) => threat.sector === "center")?.nearestRadiusM).toBeCloseTo(0.95);
  });

  it("ponto fora do arco nao entra em setor nenhum", () => {
    // 150 graus fica atras do jogador: pelo DR-1 nao ha ameaca la, e um ponto
    // desses nao pode inventar contagem em nenhum flanco.
    const threats = summarizeSectorThreats([{ azimuthDeg: 150, radiusM: 2 }]);

    expect(threats.reduce((total, threat) => total + threat.count, 0)).toBe(0);
  });

  it("respeita a fronteira de setor do modelo polar", () => {
    // -10 e o primeiro azimute do setor central (left = [-30, -10)).
    const threats = summarizeSectorThreats([
      { azimuthDeg: -10.0001, radiusM: 1.5 },
      { azimuthDeg: -10, radiusM: 1.5 },
    ]);

    expect(threats.find((threat) => threat.sector === "left")?.count).toBe(1);
    expect(threats.find((threat) => threat.sector === "center")?.count).toBe(1);
  });
});
