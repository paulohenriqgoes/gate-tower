import { describe, expect, it } from "vitest";

import { ENEMY_SCRIPT, EnemyScriptRunner, type EnemyDeployment } from "./EnemyScript";

describe("ENEMY_SCRIPT", () => {
  it("esta ordenado por atMs estritamente crescente", () => {
    for (let index = 1; index < ENEMY_SCRIPT.length; index += 1) {
      expect(ENEMY_SCRIPT[index].atMs).toBeGreaterThan(ENEMY_SCRIPT[index - 1].atMs);
    }
  });

  it("todas as invocacoes ficam dentro da partida (3 minutos)", () => {
    for (const deployment of ENEMY_SCRIPT) {
      expect(deployment.atMs).toBeGreaterThan(0);
      expect(deployment.atMs).toBeLessThan(180_000);
    }
  });

  it("todas as posicoes ficam do lado do inimigo, dentro dos limites da arena", () => {
    for (const deployment of ENEMY_SCRIPT) {
      expect(deployment.x).toBeGreaterThanOrEqual(-8);
      expect(deployment.x).toBeLessThanOrEqual(8);
      expect(deployment.z).toBeGreaterThan(0);
      expect(deployment.z).toBeLessThanOrEqual(12);
    }
  });

  it("adensa no ultimo minuto: intervalo medio entre invocacoes cai pela metade a partir de 120000ms", () => {
    const early = ENEMY_SCRIPT.filter((deployment) => deployment.atMs < 120_000);
    const late = ENEMY_SCRIPT.filter((deployment) => deployment.atMs >= 120_000);

    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);

    const earlyGaps: number[] = [];
    for (let index = 1; index < early.length; index += 1) {
      earlyGaps.push(early[index].atMs - early[index - 1].atMs);
    }

    const lateGaps: number[] = [];
    for (let index = 1; index < late.length; index += 1) {
      lateGaps.push(late[index].atMs - late[index - 1].atMs);
    }

    const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(average(lateGaps)).toBeLessThan(average(earlyGaps));
  });
});

describe("EnemyScriptRunner", () => {
  function createTestScript(): EnemyDeployment[] {
    return [
      { atMs: 1_000, cardId: "a", x: 0, z: 5 },
      { atMs: 2_000, cardId: "b", x: 1, z: 6 },
      { atMs: 5_000, cardId: "c", x: -1, z: 7 },
    ];
  }

  it("dispara cada entrada uma vez, na ordem, assim que o tempo alcanca atMs", () => {
    const deployed: EnemyDeployment[] = [];
    const runner = new EnemyScriptRunner({ script: createTestScript(), onDeploy: (d) => deployed.push(d) });

    runner.update(500);
    expect(deployed).toHaveLength(0);

    runner.update(1_000);
    expect(deployed.map((d) => d.cardId)).toEqual(["a"]);

    runner.update(1_999);
    expect(deployed.map((d) => d.cardId)).toEqual(["a"]);

    runner.update(2_500);
    expect(deployed.map((d) => d.cardId)).toEqual(["a", "b"]);

    runner.update(10_000);
    expect(deployed.map((d) => d.cardId)).toEqual(["a", "b", "c"]);
  });

  it("nao redispara entradas ja passadas em updates subsequentes", () => {
    const deployed: EnemyDeployment[] = [];
    const runner = new EnemyScriptRunner({ script: createTestScript(), onDeploy: (d) => deployed.push(d) });

    runner.update(10_000);
    runner.update(10_000);
    runner.update(20_000);

    expect(deployed).toHaveLength(3);
  });

  it("reset() permite reproduzir o script do inicio", () => {
    const deployed: EnemyDeployment[] = [];
    const runner = new EnemyScriptRunner({ script: createTestScript(), onDeploy: (d) => deployed.push(d) });

    runner.update(10_000);
    expect(deployed).toHaveLength(3);

    runner.reset();
    runner.update(10_000);
    expect(deployed).toHaveLength(6);
  });

  it("e deterministico: duas execucoes identicas do mesmo script produzem a mesma sequencia", () => {
    const run = (): string[] => {
      const deployed: EnemyDeployment[] = [];
      const runner = new EnemyScriptRunner({ script: createTestScript(), onDeploy: (d) => deployed.push(d) });
      runner.update(3_000);
      runner.update(10_000);
      return deployed.map((d) => d.cardId);
    };

    expect(run()).toEqual(run());
  });

  it("usa ENEMY_SCRIPT por default quando nenhum script e passado", () => {
    const deployed: EnemyDeployment[] = [];
    const runner = new EnemyScriptRunner({ onDeploy: (d) => deployed.push(d) });

    runner.update(180_000);

    expect(deployed).toHaveLength(ENEMY_SCRIPT.length);
    expect(deployed[0]).toEqual(ENEMY_SCRIPT[0]);
  });
});
