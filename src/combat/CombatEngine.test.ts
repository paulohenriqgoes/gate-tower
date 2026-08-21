/**
 * Teste de FIACAO do combate, com `NullEngine` (ver
 * `src/testing/nullEngineScene.ts` para as armadilhas do headless).
 *
 * O que aqui se prova nao da para provar em teste puro: que o inimigo criado
 * pela fabrica, parentado no `arenaRoot`, com alvo escolhido pelo engine e
 * movido pelo `BaseUnit`, de fato atravessa o arco sem trocar de setor, chega na
 * torre e a danifica. O modelo polar ja estava correto quando esta fiacao estava
 * errada — foi este teste que mostrou a diferenca.
 */

import { describe, expect, it } from "vitest";

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import {
  ARENA_RADIUS_M,
  MIN_PLACE_RADIUS_M,
  PLAYER_TOWER_RADIUS_M,
  sectorCenterDeg,
  toLocal,
} from "../arena/ArenaArc";
import { TOWER_ATTACK_RANGE_M, TROOP_LEASH_RADIUS_M } from "../arena/metrics";
import { CARD_CATALOG } from "../cards/cardCatalog";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import { createNullEngineScene, type NullEngineScene } from "../testing/nullEngineScene";
import { UnitFactory } from "../units/UnitFactory";
import { CombatEngine } from "./CombatEngine";

const TOWER_MAX_HEALTH = 1000;
const UNIT_GROUND_Y = 0.1375;
// Fantasma de invocacao (`GHOST_DURATION_MS` + folga): antes disso a unidade
// nao esta em campo de proposito.
const GHOST_WAIT_MS = 260;

interface Harness {
  combat: CombatEngine;
  deck: CardDeckSystem;
  headless: NullEngineScene;
}

function createHarness(): Harness {
  const headless = createNullEngineScene();
  const { scene } = headless;

  const arenaRoot = new TransformNode("arena-root", scene);
  const towerMesh = MeshBuilder.CreateCylinder("tower-blue-center", { diameter: 1, height: 1.2 }, scene);
  towerMesh.parent = arenaRoot;
  // Mesma posicao que o `ArenaSystem` da a torre do jogador: o vertice do arco.
  towerMesh.position.set(0, 0, PLAYER_TOWER_RADIUS_M);

  const deck = new CardDeckSystem({
    cards: CARD_CATALOG,
    initialMushrooms: 10,
    maxMushrooms: 10,
    regenerationIntervalMs: 1800,
  });

  const combat = new CombatEngine({
    arenaRoot,
    cardDeckSystem: deck,
    scene,
    towerAttackCooldownMs: 900,
    towerAttackDamage: 35,
    towerAttackRange: TOWER_ATTACK_RANGE_M,
    towerDefinitions: [
      { diameter: 1, id: "tower-blue-center", lane: "center", mesh: towerMesh, team: "player" },
    ],
    // Relogio simulado: sem isto os cooldowns andariam no tempo real do
    // processo enquanto o movimento anda no `deltaTime` do engine.
    now: () => headless.nowMs(),
    towerMaxHealth: TOWER_MAX_HEALTH,
    unitFactory: new UnitFactory(scene, TOWER_MAX_HEALTH, TOWER_ATTACK_RANGE_M),
    unitGroundY: UNIT_GROUND_Y,
  });

  return { combat, deck, headless };
}

function threatIn(combat: CombatEngine, sector: "left" | "center" | "right") {
  return combat.getSectorThreats().find((threat) => threat.sector === sector);
}

describe("CombatEngine — o inimigo atravessa o arco", () => {
  it("nasce na borda do flanco, converge ate a torre e a danifica", async () => {
    const { combat, headless } = createHarness();
    const defeated: string[] = [];
    combat.onEnemyDefeatedObservable.add((info) => defeated.push(info.cardId));

    expect(
      combat.deployEnemyAtArcPoint("javali-raivoso", {
        azimuthDeg: sectorCenterDeg("left"),
        radiusM: ARENA_RADIUS_M,
      })
    ).toBe(true);

    await headless.waitRealMs(GHOST_WAIT_MS);

    expect(threatIn(combat, "left")?.count).toBe(1);
    expect(threatIn(combat, "left")?.nearestRadiusM).toBeCloseTo(ARENA_RADIUS_M, 3);

    // ~60 s de partida.
    let minRadiusSeen = Number.POSITIVE_INFINITY;
    let strayedWhileStillAThreat = false;

    headless.advanceFrames(1800, () => {
      for (const threat of combat.getSectorThreats()) {
        if (threat.count === 0) {
          continue;
        }

        if (threat.sector === "left") {
          minRadiusSeen = Math.min(minRadiusSeen, threat.nearestRadiusM);
          continue;
        }

        // Aparecer em outro setor so e legitimo DENTRO do anel de fechamento,
        // onde o inimigo larga o proprio raio e fecha na torre. Fora dele, ele
        // teria trocado de flanco no meio do trajeto — e a seta da JG-05
        // estaria mentindo. Foi este o defeito que o teste headless pegou.
        if (threat.nearestRadiusM > MIN_PLACE_RADIUS_M + 1e-6) {
          strayedWhileStillAThreat = true;
        }
      }
    });

    expect(strayedWhileStillAThreat).toBe(false);
    // Chegou ate o anel de fechamento, onde a torre vive.
    expect(minRadiusSeen).toBeLessThanOrEqual(MIN_PLACE_RADIUS_M);
    // Bateu na torre...
    expect(combat.getTowerHealth("player").current).toBeLessThan(TOWER_MAX_HEALTH);
    // ...e a torre revidou ate derruba-lo, virando carta para o album. Depende
    // do tuning atual (alcance da torre x vida do Javali): se um deles mudar de
    // proposito, este numero muda junto.
    expect(defeated).toEqual(["javali-raivoso"]);

    headless.dispose();
  });

  it("reset() limpa o campo e devolve a torre a vida cheia", async () => {
    const { combat, headless } = createHarness();

    combat.deployEnemyAtArcPoint("cururu-bombado", {
      azimuthDeg: sectorCenterDeg("right"),
      radiusM: ARENA_RADIUS_M,
    });
    await headless.waitRealMs(GHOST_WAIT_MS);
    headless.advanceFrames(120);

    expect(threatIn(combat, "right")?.count).toBe(1);

    combat.reset();

    expect(combat.getSectorThreats().every((threat) => threat.count === 0)).toBe(true);
    expect(combat.getTowerHealth("player").current).toBe(TOWER_MAX_HEALTH);

    headless.dispose();
  });
});

describe("CombatEngine — a colocacao do jogador", () => {
  it("recusa dentro do raio minimo sem gastar cogumelo", () => {
    const { combat, deck, headless } = createHarness();
    let cancelled = 0;
    combat.onDeployCancelledObservable.add(() => { cancelled += 1; });

    deck.selectCard("javali-raivoso");
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    const tooClose = toLocal({ azimuthDeg: 0, radiusM: MIN_PLACE_RADIUS_M - 0.2 });
    expect(combat.tryDeployAtWorldPoint(new Vector3(tooClose.x, 0, tooClose.z))).toBe(false);

    expect(cancelled).toBe(1);
    expect(deck.getSnapshot().mushrooms).toBe(mushroomsBefore);

    headless.dispose();
  });

  it("recusa fora do arco (atras do jogador) sem gastar cogumelo", () => {
    const { combat, deck, headless } = createHarness();

    deck.selectCard("javali-raivoso");
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    // Azimute 180: as costas do jogador. Pelo `DR-1` nada acontece la.
    const behind = toLocal({ azimuthDeg: 180, radiusM: 1.6 });
    expect(combat.tryDeployAtWorldPoint(new Vector3(behind.x, 0, behind.z))).toBe(false);
    expect(deck.getSnapshot().mushrooms).toBe(mushroomsBefore);

    headless.dispose();
  });

  it("aceita no anel, debita, e a tropa defende sem perseguir alem da coleira", async () => {
    const { combat, deck, headless } = createHarness();

    deck.selectCard("javali-raivoso");
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    const placement = toLocal({ azimuthDeg: sectorCenterDeg("left"), radiusM: 1.6 });
    expect(combat.tryDeployAtWorldPoint(new Vector3(placement.x, 0, placement.z))).toBe(true);
    expect(deck.getSnapshot().mushrooms).toBeLessThan(mushroomsBefore);

    await headless.waitRealMs(GHOST_WAIT_MS);

    // Um inimigo desce pelo MESMO flanco: a tropa tem que engajar.
    combat.deployEnemyAtArcPoint("tatu-bola", {
      azimuthDeg: sectorCenterDeg("left"),
      radiusM: ARENA_RADIUS_M,
    });
    await headless.waitRealMs(GHOST_WAIT_MS);

    const troopRoot = headless.scene.transformNodes.find(
      (node) => node.name.startsWith("javali-raivoso-") && node.name.endsWith("-root")
    );
    expect(troopRoot).toBeDefined();

    const anchor = troopRoot!.position.clone();
    let maxDriftFromAnchor = 0;

    headless.advanceFrames(1200, () => {
      if (!troopRoot!.isDisposed()) {
        maxDriftFromAnchor = Math.max(maxDriftFromAnchor, Vector3.Distance(troopRoot!.position, anchor));
      }
    });

    // Saiu do lugar para brigar...
    expect(maxDriftFromAnchor).toBeGreaterThan(0);
    // ...mas nao virou perseguidor: a coleira mais o alcance de contato e o
    // limite, e e o que faz "onde colocar" continuar sendo uma decisao.
    expect(maxDriftFromAnchor).toBeLessThan(TROOP_LEASH_RADIUS_M + 0.6);
    // A torre nao apanhou: a tropa interceptou antes.
    expect(combat.getTowerHealth("player").current).toBe(TOWER_MAX_HEALTH);

    headless.dispose();
  });
});
