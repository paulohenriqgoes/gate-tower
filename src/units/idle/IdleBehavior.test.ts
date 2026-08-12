import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HEAD_YAW_CLAMP_RAD,
  IdleBehavior,
  MAX_TRANSITION_MS,
  MIN_TRANSITION_MS,
  type IdleBehaviorBounds,
  type IdleState,
} from "./IdleBehavior";

// NullEngine roda o Babylon.js sem WebGL, o suficiente para TransformNode e
// Scene existirem em Node — a maquina de estados nao precisa de nada alem
// disso para ser testada.
let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const WIDE_OPEN_BOUNDS: IdleBehaviorBounds = {
  maxX: 1000,
  maxZ: 1000,
  minX: -1000,
  minZ: -1000,
};

/** Gerador de random determinístico a partir de uma sequência fixa, cíclica. */
function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function createNode(name: string): TransformNode {
  return new TransformNode(name, scene);
}

interface BehaviorHarness {
  behavior: IdleBehavior;
  headNode: TransformNode;
  root: TransformNode;
  visualRoot: TransformNode;
}

function buildBehavior(overrides: {
  bounds?: IdleBehaviorBounds;
  getCameraPosition?: () => Vector3 | null;
  getNeighborPositions?: () => Vector3[];
  headNode?: TransformNode | null;
  random?: () => number;
} = {}): BehaviorHarness {
  const root = createNode("root");
  const visualRoot = createNode("visual-root");
  visualRoot.parent = root;
  const headNode = createNode("head");
  headNode.parent = visualRoot;

  const resolvedHeadNode = overrides.headNode === undefined ? headNode : overrides.headNode;

  const behavior = new IdleBehavior({
    bounds: overrides.bounds ?? WIDE_OPEN_BOUNDS,
    getCameraPosition: overrides.getCameraPosition ?? (() => null),
    getNeighborPositions: overrides.getNeighborPositions ?? (() => []),
    headNode: resolvedHeadNode,
    random: overrides.random,
    root,
    visualRoot,
  });

  return { behavior, headNode, root, visualRoot };
}

/**
 * Roda update() em passos pequenos ate o estado bater com `target`, depois
 * continua por mais `convergeMs` (bem abaixo de MIN_TRANSITION_MS) para dar
 * tempo do damping convergir sem risco de cruzar para a proxima transicao.
 * Devolve o nowMs final. Falha o teste se `target` nunca for alcancado.
 */
function runUntilState(
  behavior: IdleBehavior,
  target: IdleState,
  options: { convergeMs?: number; dtMs?: number; maxNowMs?: number } = {}
): number {
  const dtMs = options.dtMs ?? 50;
  const maxNowMs = options.maxNowMs ?? 20000;
  const convergeMs = options.convergeMs ?? 1500;

  let nowMs = 0;
  while (nowMs < maxNowMs && behavior.getState() !== target) {
    nowMs += dtMs;
    behavior.update(dtMs / 1000, nowMs);
  }

  if (behavior.getState() !== target) {
    throw new Error(`estado "${target}" nao foi alcancado ate nowMs=${maxNowMs}`);
  }

  const convergeUntil = nowMs + convergeMs;
  while (nowMs < convergeUntil) {
    nowMs += dtMs;
    behavior.update(dtMs / 1000, nowMs);
  }

  return nowMs;
}

describe("IdleBehavior - transicoes", () => {
  it("acontece dentro da janela de 2 a 6 segundos", () => {
    // random() = 0.5 sempre -> duracao de transicao = MIN + 0.5*(MAX-MIN) = 4000ms,
    // constante e independente de quantas vezes random() ja foi chamado.
    const { behavior } = buildBehavior({ random: () => 0.5 });

    let nowMs = 0;
    let previousState = behavior.getState();
    let lastTransitionAt = 0;
    let transitions = 0;

    for (let i = 0; i < 80; i += 1) {
      nowMs += 200;
      behavior.update(0.2, nowMs);

      if (behavior.getState() !== previousState) {
        const gap = nowMs - lastTransitionAt;
        expect(gap).toBeGreaterThanOrEqual(MIN_TRANSITION_MS);
        expect(gap).toBeLessThanOrEqual(MAX_TRANSITION_MS);
        lastTransitionAt = nowMs;
        previousState = behavior.getState();
        transitions += 1;
      }
    }

    expect(transitions).toBeGreaterThan(1);
  });

  it("nunca sorteia o mesmo estado duas vezes seguidas", () => {
    // Sequencia de randoms variada o bastante para percorrer varios estados.
    // A garantia de "nunca repete" e estrutural (pickNextState exclui sempre
    // o estado atual), entao o teste nao depende dos valores exatos.
    const { behavior } = buildBehavior({
      random: sequenceRandom([0.05, 0.9, 0.95, 0.1, 0.99, 0.3, 0.02, 0.7, 0.15, 0.88]),
    });

    let nowMs = 0;
    let previousState = behavior.getState();
    const seenTransitions: IdleState[] = [previousState];

    for (let i = 0; i < 80; i += 1) {
      nowMs += 300;
      behavior.update(0.3, nowMs);

      const currentState = behavior.getState();
      if (currentState !== previousState) {
        seenTransitions.push(currentState);
        previousState = currentState;
      }
    }

    for (let i = 1; i < seenTransitions.length; i += 1) {
      expect(seenTransitions[i]).not.toBe(seenTransitions[i - 1]);
    }
    expect(seenTransitions.length).toBeGreaterThan(2);
  });

  it("duas instancias construidas no mesmo instante, com random diferente, nao ficam em fase", () => {
    // O primeiro valor de cada sequencia vira o offset de fase da respiracao
    // (sorteado no construtor) — sao bem diferentes de proposito (0.1 vs 0.9).
    const a = buildBehavior({ random: sequenceRandom([0.1, 0.4, 0.6, 0.2]) });
    const b = buildBehavior({ random: sequenceRandom([0.9, 0.6, 0.2, 0.8]) });

    let nowMs = 0;
    const bobA: number[] = [];
    const bobB: number[] = [];

    for (let i = 0; i < 20; i += 1) {
      nowMs += 100;
      a.behavior.update(0.1, nowMs);
      b.behavior.update(0.1, nowMs);
      bobA.push(a.visualRoot.position.y);
      bobB.push(b.visualRoot.position.y);
    }

    // Se a fase da respiracao fosse igual, as duas series seriam identicas
    // amostra a amostra. Com offsets de fase diferentes, divergem em algum
    // ponto da janela observada.
    const identical = bobA.every((value, index) => Math.abs(value - bobB[index]) < 1e-9);
    expect(identical).toBe(false);
  });
});

describe("IdleBehavior - vagando", () => {
  it("respeita os bounds da arena e nao deixa a criatura escapar", () => {
    const tightBounds: IdleBehaviorBounds = { maxX: 1, maxZ: 1, minX: -1, minZ: -1 };
    // random constante: o valor exato so decide qual estado sai sorteado a
    // cada troca, mas o teste checa os bounds em TODO frame, independente de
    // qual estado esta ativo (so "vagando" move root.position, e sempre
    // clampado). Com este valor a maquina cicla entre "vagando" e "parado".
    const { behavior, root } = buildBehavior({
      bounds: tightBounds,
      random: () => 0.7,
    });

    let nowMs = 0;
    for (let i = 0; i < 500; i += 1) {
      nowMs += 100;
      behavior.update(0.1, nowMs);

      expect(root.position.x).toBeGreaterThanOrEqual(tightBounds.minX);
      expect(root.position.x).toBeLessThanOrEqual(tightBounds.maxX);
      expect(root.position.z).toBeGreaterThanOrEqual(tightBounds.minZ);
      expect(root.position.z).toBeLessThanOrEqual(tightBounds.maxZ);
    }
  });
});

describe("IdleBehavior - social", () => {
  it("cai para parado quando nao ha vizinho no raio", () => {
    const { behavior } = buildBehavior({
      getNeighborPositions: () => [],
      // roll = 0.95 * 75 (peso de observando+vagando+social, excluindo o
      // "parado" inicial) = 71.25, cai na faixa de "social" ([60,75)).
      random: () => 0.95,
    });

    // `updateSocial` roda no MESMO update() que fez a transicao para "social";
    // sem vizinho ela derruba o estado para "parado" nesse frame. Ou seja: o
    // estado social nunca chega a ser observavel de fora — e e isso que o teste
    // afirma. Por isso nao da para usar `runUntilState` aqui: ele espera ver um
    // estado que, por construcao, nunca persiste ate o fim de um update.
    const observedStates = new Set<IdleState>();

    for (let nowMs = 50; nowMs <= 20000; nowMs += 50) {
      behavior.update(0.05, nowMs);
      observedStates.add(behavior.getState());
    }

    expect(observedStates.has("social")).toBe(false);
    expect(observedStates.has("parado")).toBe(true);
  });

  it("vira o corpo para o vizinho mais proximo quando ha um no raio", () => {
    // Dentro de SOCIAL_RADIUS (4.5): a 5 unidades a criatura ignoraria o
    // vizinho e cairia para "parado".
    const neighborPosition = new Vector3(3, 0, 0);
    const { behavior, root } = buildBehavior({
      getNeighborPositions: () => [neighborPosition],
      random: () => 0.95,
    });

    runUntilState(behavior, "social");

    expect(behavior.getState()).toBe("social");
    // Vizinho esta em +X: yaw esperado proximo de +PI/2 (atan2(x,z) com z=0).
    expect(root.rotation.y).toBeCloseTo(Math.PI / 2, 1);
  });
});

describe("IdleBehavior - observando", () => {
  it("clampa o angulo da cabeca a HEAD_YAW_CLAMP_RAD", () => {
    const { behavior, headNode, root } = buildBehavior({
      getCameraPosition: () => new Vector3(1000, 0, 0), // bem de lado, forca o clamp
      // roll = 0.2 * 75 = 15, cai na faixa de "observando" ([0,40)).
      random: () => 0.2,
    });

    runUntilState(behavior, "observando");

    // Corpo nao deve ter girado (so a cabeca gira no estado "observando" com headNode).
    expect(root.rotation.y).toBeCloseTo(0, 3);
    expect(Math.abs(headNode.rotation.y)).toBeLessThanOrEqual(HEAD_YAW_CLAMP_RAD + 1e-3);
    // A camera esta bem de lado (90 graus): o clamp deve estar saturado.
    expect(Math.abs(headNode.rotation.y)).toBeGreaterThan(HEAD_YAW_CLAMP_RAD - 0.05);
  });

  it("sem headNode, cai para uma rotacao pequena do corpo inteiro", () => {
    const { behavior, root } = buildBehavior({
      getCameraPosition: () => new Vector3(1000, 0, 0),
      headNode: null,
      random: () => 0.2,
    });

    runUntilState(behavior, "observando");

    // Bem menor que o clamp da cabeca de verdade (~70 graus).
    expect(Math.abs(root.rotation.y)).toBeLessThan(HEAD_YAW_CLAMP_RAD);
    expect(Math.abs(root.rotation.y)).toBeGreaterThan(0.05);
  });
});

describe("IdleBehavior - respiracao", () => {
  it("roda sempre, sobreposta a qualquer estado", () => {
    const { behavior, visualRoot } = buildBehavior({ random: () => 0.5 });

    const samples: number[] = [];
    let nowMs = 0;
    for (let i = 0; i < 60; i += 1) {
      nowMs += 100;
      behavior.update(0.1, nowMs);
      samples.push(visualRoot.position.y);
    }

    const distinctValues = new Set(samples.map((value) => value.toFixed(6)));
    expect(distinctValues.size).toBeGreaterThan(1);
  });

  it("dispose restaura a rotacao e a posicao de repouso", () => {
    const { behavior, headNode, root, visualRoot } = buildBehavior({
      getCameraPosition: () => new Vector3(1000, 0, 0),
      random: () => 0.2,
    });

    runUntilState(behavior, "observando");
    behavior.dispose();

    expect(root.rotation.y).toBe(0);
    expect(visualRoot.position.y).toBe(0);
    expect(headNode.rotation.y).toBe(0);
  });
});
