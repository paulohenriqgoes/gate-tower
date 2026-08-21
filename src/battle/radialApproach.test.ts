import { describe, expect, it } from "vitest";

import {
  MIN_PLACE_RADIUS_M,
  sectorCenterDeg,
  sectorOf,
  toArc,
  toLocal,
} from "../arena/ArenaArc";
import { radialApproachDestination } from "./radialApproach";

// O alvo e o JOGADOR, e ele E a origem do arco (JG-12). Era a torre do jogador,
// a 0,9 m no azimute 0. O ponto e escrito literal, e nao derivado de constante,
// porque "o alvo esta no vertice" e a propriedade sob teste — se ela mudar, este
// arquivo tem de falhar em vez de acompanhar em silencio.
const TARGET = { x: 0, z: 0 };
const CLOSING = MIN_PLACE_RADIUS_M;

describe("radialApproachDestination", () => {
  it("no anel jogavel, o destino tem o MESMO azimute e raio menor", () => {
    const from = toLocal({ azimuthDeg: sectorCenterDeg("left"), radiusM: 2.2 });
    const destination = radialApproachDestination(from, TARGET, CLOSING);

    expect(toArc(destination).azimuthDeg).toBeCloseTo(sectorCenterDeg("left"), 9);
    expect(toArc(destination).radiusM).toBeCloseTo(CLOSING, 9);
  });

  it("dentro do anel de fechamento, o destino e o proprio alvo", () => {
    const from = toLocal({ azimuthDeg: sectorCenterDeg("right"), radiusM: CLOSING - 0.01 });
    const destination = radialApproachDestination(from, TARGET, CLOSING);

    expect(destination.x).toBeCloseTo(TARGET.x, 9);
    expect(destination.z).toBeCloseTo(TARGET.z, 9);
  });

  it("um trajeto inteiro nao troca de setor antes do fechamento", () => {
    // Simula o inimigo andando em passos de 5 cm para o destino devolvido, a
    // partir da borda do arco. E a garantia que a seta de flanco precisa: o
    // setor anunciado no nascimento vale ate a ameaca chegar.
    const startAzimuth = sectorCenterDeg("left");
    let position = toLocal({ azimuthDeg: startAzimuth, radiusM: 2.2 });

    for (let step = 0; step < 200; step += 1) {
      const arc = toArc(position);
      if (arc.radiusM <= CLOSING) {
        break;
      }

      expect(sectorOf(arc.azimuthDeg)).toBe("left");

      const destination = radialApproachDestination(position, TARGET, CLOSING);
      const dx = destination.x - position.x;
      const dz = destination.z - position.z;
      const length = Math.hypot(dx, dz);
      const stepLength = Math.min(0.05, length);

      position = {
        x: position.x + (dx / length) * stepLength,
        z: position.z + (dz / length) * stepLength,
      };
    }

    expect(toArc(position).radiusM).toBeLessThanOrEqual(CLOSING + 1e-9);
    expect(toArc(position).azimuthDeg).toBeCloseTo(startAzimuth, 6);
  });
});
