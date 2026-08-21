/**
 * Teste de FIACAO do combate, com `NullEngine` (ver
 * `src/testing/nullEngineScene.ts` para as armadilhas do headless).
 *
 * O que aqui se prova nao da para provar em teste puro: que o inimigo criado
 * pela fabrica, parentado no `arenaRoot`, com alvo escolhido pelo engine e
 * movido pelo `BaseUnit`, de fato atravessa o arco sem trocar de setor, chega no
 * JOGADOR e o danifica. O modelo polar ja estava correto quando esta fiacao
 * estava errada — foi este teste que mostrou a diferenca.
 */

import { describe, expect, it } from "vitest";

import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { arenaEdgeRadiusAt, MIN_PLACE_RADIUS_M, sectorCenterDeg, toLocal } from "../arena/ArenaArc";
import {
  FIREBALL_COST_MUSHROOMS,
  PLAYER_BODY_RADIUS_M,
  PLAYER_MAX_HEALTH,
  TROOP_LEASH_RADIUS_M,
} from "../arena/metrics";
import { CARD_CATALOG } from "../cards/cardCatalog";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import { createNullEngineScene, type NullEngineScene } from "../testing/nullEngineScene";
import { UnitFactory } from "../units/UnitFactory";
import { CombatEngine } from "./CombatEngine";

const UNIT_GROUND_Y = 0.1375;
// Fantasma de invocacao (`GHOST_DURATION_MS` + folga): antes disso a unidade
// nao esta em campo de proposito.
const GHOST_WAIT_MS = 260;

interface Harness {
  combat: CombatEngine;
  deck: CardDeckSystem;
  headless: NullEngineScene;
  /** Para onde o "celular" aponta. Colocar carta so vale dentro do cone de acao. */
  aimAt: (yawDeg: number) => void;
}

/** Ponto na borda da arena, no centro de um flanco. */
function edgeOf(sector: "left" | "center" | "right") {
  const azimuthDeg = sectorCenterDeg(sector);
  return { azimuthDeg, radiusM: arenaEdgeRadiusAt(azimuthDeg) };
}

// `playerMaxHealth` e parametro so para o teste de derrota: com os 1000 de
// producao, derrubar o jogador levaria minutos de frames simulados sem provar
// nada a mais. O resto dos testes usa o valor real.
function createHarness(playerMaxHealth: number = PLAYER_MAX_HEALTH): Harness {
  const headless = createNullEngineScene();
  const { scene } = headless;

  let cameraYawDeg = 0;

  const arenaRoot = new TransformNode("arena-root", scene);
  // Nao ha malha de torre para montar: desde a JG-12 o alvo e o `PlayerCore`,
  // que o proprio `CombatEngine` constroi na origem e que nao tem geometria.

  const deck = new CardDeckSystem({
    cards: CARD_CATALOG,
    initialMushrooms: 10,
    maxMushrooms: 10,
    regenerationIntervalMs: 1800,
  });

  const combat = new CombatEngine({
    arenaRoot,
    cardDeckSystem: deck,
    getCameraYawDeg: () => cameraYawDeg,
    // Relogio simulado: sem isto os cooldowns andariam no tempo real do
    // processo enquanto o movimento anda no `deltaTime` do engine.
    now: () => headless.nowMs(),
    playerBodyRadius: PLAYER_BODY_RADIUS_M,
    playerMaxHealth,
    scene,
    unitFactory: new UnitFactory(scene),
    unitGroundY: UNIT_GROUND_Y,
  });

  return {
    combat,
    deck,
    headless,
    aimAt: (yawDeg: number) => {
      cameraYawDeg = yawDeg;
    },
  };
}

function threatIn(combat: CombatEngine, sector: "left" | "center" | "right") {
  return combat.getSectorThreats().find((threat) => threat.sector === sector);
}

describe("CombatEngine — o inimigo atravessa o arco", () => {
  it("nasce na borda do flanco, converge ate o JOGADOR e o danifica", async () => {
    const { combat, headless } = createHarness();
    const defeated: string[] = [];
    combat.onEnemyDefeatedObservable.add((info) => defeated.push(info.cardId));

    expect(combat.deployEnemyAtArcPoint("javali-raivoso", edgeOf("left"))).toBe(true);

    await headless.waitRealMs(GHOST_WAIT_MS);

    expect(threatIn(combat, "left")?.count).toBe(1);
    expect(threatIn(combat, "left")?.nearestRadiusM).toBeCloseTo(edgeOf("left").radiusM, 3);

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

        // Desde a JG-12 aparecer em outro setor NUNCA e legitimo: o alvo e a
        // origem do arco, entao a reta ate ele ja e a reta radial e nao existe
        // mais a fase de fechamento em que o inimigo largava o proprio raio.
        // Enquanto o alvo era a torre (a 0,9 m no azimute 0), trocar de flanco
        // perto do fim era tolerado — e foi ai que o teste headless pegou o
        // defeito que fazia a seta da JG-05 mentir no trajeto inteiro.
        strayedWhileStillAThreat = true;
      }
    });

    expect(strayedWhileStillAThreat).toBe(false);

    // Parou a `contactRange` + `PLAYER_BODY_RADIUS_M` do jogador: perto o
    // bastante para bater, longe o bastante para caber no quadro quando o
    // celular aponta para a frente. Sem o raio de corpo ele encostaria na
    // origem — dentro dos pes de quem joga, abaixo da camera.
    expect(minRadiusSeen).toBeGreaterThan(PLAYER_BODY_RADIUS_M);
    expect(minRadiusSeen).toBeLessThan(PLAYER_BODY_RADIUS_M + 0.5);

    // Bateu no JOGADOR.
    expect(combat.getPlayerHealth().current).toBeLessThan(PLAYER_MAX_HEALTH);

    // E NINGUEM revidou. Este `toEqual([])` e a prova da decisao que abriu a
    // JG-12: a torre do jogador atacava sozinha quem chegasse a 1 m, e com isso
    // duas partidas medidas em device terminaram com 100% e 99,1% de vida — nao
    // havia jogo. Quem defende, agora, e carta.
    expect(defeated).toEqual([]);

    headless.dispose();
  });

  it("o jogador pode CAIR — e a derrota dispara uma vez so", async () => {
    const { combat, headless } = createHarness(40);
    let defeats = 0;
    combat.onPlayerDefeatedObservable.add(() => { defeats += 1; });

    // Dois flancos ao mesmo tempo: e o cenario que a v3 desenha, com o jogador
    // sem conseguir olhar para os dois.
    combat.deployEnemyAtArcPoint("javali-raivoso", edgeOf("left"));
    combat.deployEnemyAtArcPoint("javali-raivoso", edgeOf("right"));
    await headless.waitRealMs(GHOST_WAIT_MS);

    expect(combat.getPlayerHealth().current).toBe(40);

    // ~60 s: tempo de sobra para atravessar o arco e bater.
    headless.advanceFrames(1800);

    expect(combat.getPlayerHealth().current).toBe(0);
    expect(combat.getPlayerHealthPct()).toBe(0);
    // UMA vez, mesmo com dois inimigos continuando a bater depois da queda —
    // sem a guarda de transicao, a derrota dispararia por frame e o `GameFlow`
    // encerraria a partida em rajada.
    expect(defeats).toBe(1);

    headless.dispose();
  });

  it("reset() limpa o campo e devolve o JOGADOR a vida cheia", async () => {
    const { combat, headless } = createHarness();

    combat.deployEnemyAtArcPoint("cururu-bombado", edgeOf("right"));
    await headless.waitRealMs(GHOST_WAIT_MS);
    headless.advanceFrames(120);

    expect(threatIn(combat, "right")?.count).toBe(1);

    combat.reset();

    expect(combat.getSectorThreats().every((threat) => threat.count === 0)).toBe(true);
    expect(combat.getPlayerHealth().current).toBe(PLAYER_MAX_HEALTH);

    headless.dispose();
  });
});

describe("CombatEngine — a colocacao do jogador", () => {
  it("recusa dentro do raio minimo sem gastar cogumelo", () => {
    const { combat, deck, headless, aimAt } = createHarness();
    let cancelled = 0;
    combat.onDeployCancelledObservable.add(() => { cancelled += 1; });

    deck.selectCard("javali-raivoso");
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    // Mirando EXATAMENTE no ponto: assim a unica coisa que pode recusar e o
    // raio minimo, e nao o cone de acao.
    aimAt(0);
    const tooClose = toLocal({ azimuthDeg: 0, radiusM: MIN_PLACE_RADIUS_M - 0.2 });
    expect(combat.tryDeployAtWorldPoint(new Vector3(tooClose.x, 0, tooClose.z))).toBe(false);

    expect(cancelled).toBe(1);
    expect(deck.getSnapshot().mushrooms).toBe(mushroomsBefore);

    headless.dispose();
  });

  it("recusa atras do jogador sem gastar cogumelo", () => {
    const { combat, deck, headless } = createHarness();

    deck.selectCard("javali-raivoso");
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    // Azimute 180: as costas do jogador. Pelo `DR-1` nada acontece la.
    const behind = toLocal({ azimuthDeg: 180, radiusM: 1.6 });
    expect(combat.tryDeployAtWorldPoint(new Vector3(behind.x, 0, behind.z))).toBe(false);
    expect(deck.getSnapshot().mushrooms).toBe(mushroomsBefore);

    headless.dispose();
  });

  it("recusa um ponto VALIDO da arena que esta fora do cone de acao", () => {
    const { combat, deck, headless, aimAt } = createHarness();

    deck.selectCard("javali-raivoso");
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    // O ponto esta dentro da arena e o jogador o VE — ele so nao o alcanca,
    // porque esta mirando no flanco oposto. E o recurso escasso do jogo em uma
    // asserçao: cobrir os tres flancos custa tres giros.
    aimAt(sectorCenterDeg("right"));
    const farFlank = toLocal({ azimuthDeg: sectorCenterDeg("left"), radiusM: 1.5 });
    expect(combat.tryDeployAtWorldPoint(new Vector3(farFlank.x, 0, farFlank.z))).toBe(false);
    expect(deck.getSnapshot().mushrooms).toBe(mushroomsBefore);

    // Girar para la resolve, sem nada mais mudar.
    aimAt(sectorCenterDeg("left"));
    expect(combat.tryDeployAtWorldPoint(new Vector3(farFlank.x, 0, farFlank.z))).toBe(true);
    expect(deck.getSnapshot().mushrooms).toBeLessThan(mushroomsBefore);

    headless.dispose();
  });

  it("aceita no cone, debita, e a tropa defende sem perseguir alem da coleira", async () => {
    const { combat, deck, headless, aimAt } = createHarness();

    deck.selectCard("javali-raivoso");
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    aimAt(sectorCenterDeg("left"));
    const placement = toLocal({ azimuthDeg: sectorCenterDeg("left"), radiusM: 1.5 });
    expect(combat.tryDeployAtWorldPoint(new Vector3(placement.x, 0, placement.z))).toBe(true);
    expect(deck.getSnapshot().mushrooms).toBeLessThan(mushroomsBefore);

    await headless.waitRealMs(GHOST_WAIT_MS);

    // Um inimigo desce pelo MESMO flanco: a tropa tem que engajar.
    combat.deployEnemyAtArcPoint("tatu-bola", edgeOf("left"));
    await headless.waitRealMs(GHOST_WAIT_MS);

    const enemyRoot = headless.scene.transformNodes.find(
      (node) => node.name.startsWith("tatu-bola-") && node.name.endsWith("-root")
    );
    expect(enemyRoot).toBeDefined();

    const troopRoot = headless.scene.transformNodes.find(
      (node) => node.name.startsWith("javali-raivoso-") && node.name.endsWith("-root")
    );
    expect(troopRoot).toBeDefined();

    const anchor = troopRoot!.position.clone();
    let maxDriftFromAnchor = 0;
    let minDistanceToEnemy = Number.POSITIVE_INFINITY;

    headless.advanceFrames(1200, () => {
      if (troopRoot!.isDisposed() || enemyRoot!.isDisposed()) {
        return;
      }

      maxDriftFromAnchor = Math.max(maxDriftFromAnchor, Vector3.Distance(troopRoot!.position, anchor));
      minDistanceToEnemy = Math.min(
        minDistanceToEnemy,
        Vector3.Distance(troopRoot!.position, enemyRoot!.position)
      );
    });

    // Saiu do lugar para brigar...
    expect(maxDriftFromAnchor).toBeGreaterThan(0);
    // ...mas nao virou perseguidor: a coleira mais o alcance de contato e o
    // limite, e e o que faz "onde colocar" continuar sendo uma decisao.
    expect(maxDriftFromAnchor).toBeLessThan(TROOP_LEASH_RADIUS_M + 0.6);
    // E ela foi ATE o inimigo, nao so deu uns passos: chegou a distancia de
    // briga. Sem esta asserçao, uma tropa que andasse 10 cm para o lado e
    // parasse passaria pelas duas de cima.
    expect(minDistanceToEnemy).toBeLessThan(TROOP_LEASH_RADIUS_M);

    // O teste NAO afirma mais que o jogador saiu ileso, e nem que o inimigo
    // morreu. Ele afirmava a primeira coisa, e passava porque a torre do jogador
    // atacava sozinha o que vazasse. Sem ela — e essa e a mudanca da JG-12 — uma
    // tropa so num flanco nao garante zero dano; e um Javali contra um Tatu Bola
    // (o tanque) nao resolve em 40 s de simulacao. Fixar qualquer um dos dois
    // aqui seria congelar um balanceamento que ainda nao foi jogado.

    headless.dispose();
  });
});

describe("CombatEngine — a fireball", () => {
  it("sem carta na mao, o tiro sai e debita 1 cogumelo", async () => {
    const { combat, deck, headless, aimAt } = createHarness();
    let casts = 0;
    combat.onFireballCastObservable.add(() => { casts += 1; });

    combat.deployEnemyAtArcPoint("javali-raivoso", edgeOf("center"));
    await headless.waitRealMs(GHOST_WAIT_MS);

    aimAt(0);
    const mushroomsBefore = deck.getSnapshot().mushrooms;

    expect(combat.castFireball()).toBe(true);
    expect(deck.getSnapshot().mushrooms).toBe(mushroomsBefore - FIREBALL_COST_MUSHROOMS);
    expect(casts).toBe(1);

    headless.dispose();
  });

  it("sem cogumelo, nao sai e nao debita", async () => {
    const { combat, deck, headless, aimAt } = createHarness();
    let casts = 0;
    combat.onFireballCastObservable.add(() => { casts += 1; });

    deck.setMushrooms(0);
    aimAt(0);

    expect(combat.castFireball()).toBe(false);
    expect(deck.getSnapshot().mushrooms).toBe(0);
    // Nem o evento dispara: quem ouve nao pode tocar som de disparo para um
    // tiro que nao saiu.
    expect(casts).toBe(0);

    headless.dispose();
  });

  it("acerta o inimigo enquadrado e o abate — virando carta como qualquer morte", async () => {
    const { combat, deck, headless, aimAt } = createHarness();
    const defeated: string[] = [];
    combat.onEnemyDefeatedObservable.add((info) => defeated.push(info.cardId));

    combat.deployEnemyAtArcPoint("javali-raivoso", edgeOf("center"));
    await headless.waitRealMs(GHOST_WAIT_MS);

    aimAt(0);

    // Estoque cheio, tiro atras de tiro: a fireball nao tem cooldown, entao o
    // unico limite e o cogumelo. Um Javali tem 200 de vida e a fireball da 50,
    // entao quatro tiros bastam — o quinto e a margem do teste.
    for (let shot = 0; shot < 5; shot += 1) {
      deck.setMushrooms(10);
      expect(combat.castFireball()).toBe(true);
      // Tempo de voo: a bola precisa CHEGAR para o dano existir.
      headless.advanceFrames(40);
    }

    // A morte por fireball entra na economia do album igual a morte por tropa
    // (spec v3 §8) — se este observable nao disparasse, matar de magia sairia
    // de graca para o jogador e sem recompensa.
    expect(defeated).toEqual(["javali-raivoso"]);

    headless.dispose();
  });

  it("mirando no flanco errado, o tiro erra — e o cogumelo vai embora do mesmo jeito", async () => {
    const { combat, deck, headless, aimAt } = createHarness();
    const defeated: string[] = [];
    combat.onEnemyDefeatedObservable.add((info) => defeated.push(info.cardId));

    combat.deployEnemyAtArcPoint("javali-raivoso", edgeOf("left"));
    await headless.waitRealMs(GHOST_WAIT_MS);

    // Olhando para o flanco oposto ao do inimigo.
    aimAt(sectorCenterDeg("right"));

    for (let shot = 0; shot < 10; shot += 1) {
      deck.setMushrooms(10);
      const before = deck.getSnapshot().mushrooms;
      expect(combat.castFireball()).toBe(true);
      // Cobrar o tiro perdido e o que faz atirar a esmo custar caro.
      expect(deck.getSnapshot().mushrooms).toBe(before - FIREBALL_COST_MUSHROOMS);
      headless.advanceFrames(40);
    }

    expect(defeated).toEqual([]);

    headless.dispose();
  });

  it("reset() limpa os projeteis em voo", async () => {
    const { combat, headless, aimAt } = createHarness();

    combat.deployEnemyAtArcPoint("javali-raivoso", edgeOf("center"));
    await headless.waitRealMs(GHOST_WAIT_MS);

    aimAt(0);
    expect(combat.castFireball()).toBe(true);

    // Sem avancar frames: a bola esta no ar exatamente agora.
    const fireballsInFlight = () =>
      headless.scene.meshes.filter((mesh) => mesh.name === "fireball" && !mesh.isDisposed()).length;
    expect(fireballsInFlight()).toBe(1);

    combat.reset();

    // Uma bola sobrevivente atravessaria a partida seguinte e aplicaria dano de
    // uma partida que ja acabou.
    expect(fireballsInFlight()).toBe(0);

    headless.dispose();
  });
});
