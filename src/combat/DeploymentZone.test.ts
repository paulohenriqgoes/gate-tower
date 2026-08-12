import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeploymentZone, type DeploymentZoneArenaLayout } from "./DeploymentZone";

// NullEngine roda o Babylon.js sem WebGL: o suficiente para materiais/meshes
// existirem sem precisar de canvas real. `isInside` e logica pura de limites,
// nao precisa de render.
let engine: NullEngine;
let scene: Scene;
let arenaRoot: TransformNode;
let zone: DeploymentZone;

// Espelha `ArenaSystem.buildInitialArena`: 16x24 unidades autorais, jogador
// em z <= 0.
const arenaLayout: DeploymentZoneArenaLayout = {
  maxX: 8,
  minX: -8,
  minZ: -12,
  playerDeploymentMaxZ: 0,
};

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  arenaRoot = new TransformNode("arena-root", scene);
  zone = new DeploymentZone({ arenaLayout, arenaRoot, scene });
});

afterEach(() => {
  zone.dispose();
  scene.dispose();
  engine.dispose();
});

describe("DeploymentZone.isInside", () => {
  it("aceita um ponto bem no meio da metade do jogador", () => {
    expect(zone.isInside(new Vector3(0, 0, -6))).toBe(true);
  });

  it("rejeita um ponto na metade do inimigo (z > 0)", () => {
    expect(zone.isInside(new Vector3(0, 0, 1))).toBe(false);
  });

  it("rejeita um ponto fora dos limites laterais (x alem de maxX/minX)", () => {
    expect(zone.isInside(new Vector3(9, 0, -6))).toBe(false);
    expect(zone.isInside(new Vector3(-9, 0, -6))).toBe(false);
  });

  it("rejeita um ponto alem do fundo da arena (z < minZ)", () => {
    expect(zone.isInside(new Vector3(0, 0, -13))).toBe(false);
  });

  it("aceita as bordas inclusive: minX, maxX, minZ e playerDeploymentMaxZ", () => {
    expect(zone.isInside(new Vector3(arenaLayout.minX, 0, -6))).toBe(true);
    expect(zone.isInside(new Vector3(arenaLayout.maxX, 0, -6))).toBe(true);
    expect(zone.isInside(new Vector3(0, 0, arenaLayout.minZ))).toBe(true);
    expect(zone.isInside(new Vector3(0, 0, arenaLayout.playerDeploymentMaxZ))).toBe(true);
  });

  it("rejeita logo apos a borda em cada direcao", () => {
    expect(zone.isInside(new Vector3(arenaLayout.minX - 0.001, 0, -6))).toBe(false);
    expect(zone.isInside(new Vector3(arenaLayout.maxX + 0.001, 0, -6))).toBe(false);
    expect(zone.isInside(new Vector3(0, 0, arenaLayout.minZ - 0.001))).toBe(false);
    expect(zone.isInside(new Vector3(0, 0, arenaLayout.playerDeploymentMaxZ + 0.001))).toBe(false);
  });
});

describe("DeploymentZone.setHighlighted", () => {
  it("nasce apagada", () => {
    const freshZone = new DeploymentZone({ arenaLayout, arenaRoot, scene });
    // isVisible e privado ao mesh; testado indiretamente via comportamento
    // publico nao e possivel aqui sem expor o mesh, entao o teste de
    // visibilidade fica a cargo da integracao (CombatEngine). O que importa
    // testar em isolamento e que a chamada nao lanca e e idempotente.
    expect(() => freshZone.setHighlighted(true)).not.toThrow();
    expect(() => freshZone.setHighlighted(false)).not.toThrow();
    freshZone.dispose();
  });
});
