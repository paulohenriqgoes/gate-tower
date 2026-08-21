import { describe, expect, it } from "vitest";

import { evaluatePlacement, reachableSectors, sectorCenterDeg, type SectorId } from "../arena/ArenaArc";
import { WaveDirector, type SpawnOrder } from "./WaveDirector";

/** Gerador deterministico de valores em [0,1), independente de Math.random (mesmo LCG de ArenaArc.test.ts). */
function seededRng(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe("WaveDirector — disparo por tempo", () => {
  it("uma onda dispara uma unica vez, no tempo certo, e nao repete em chamadas seguintes", () => {
    const director = new WaveDirector({
      waves: [{ atMs: 5000, entries: [{ cardId: "grunt", count: 1 }] }],
      getCameraYawDeg: () => 0,
      rng: seededRng(1)
    });

    expect(director.update(0)).toEqual([]);
    expect(director.update(4999)).toEqual([]);

    const firstFire = director.update(5000);
    expect(firstFire).toHaveLength(1);
    expect(firstFire[0].cardId).toBe("grunt");

    // Chamadas seguintes, mesmo bem depois, nao reemitem.
    expect(director.update(5001)).toEqual([]);
    expect(director.update(60_000)).toEqual([]);
  });

  it("salto grande de tempo dispara todas as ondas pendentes, em ordem de atMs, sem pular nenhuma", () => {
    // Array de entrada fora de ordem de proposito — o director tem que ordenar por atMs, nao confiar na ordem de input.
    const director = new WaveDirector({
      waves: [
        { atMs: 20_000, entries: [{ cardId: "c", count: 1 }] },
        { atMs: 1_000, entries: [{ cardId: "a", count: 1 }] },
        { atMs: 5_000, entries: [{ cardId: "b", count: 1 }] }
      ],
      getCameraYawDeg: () => 0,
      rng: seededRng(2)
    });

    expect(director.update(500)).toEqual([]);

    // Simula o jogo travando: pula de 500 direto para 20000. As tres ondas pendentes
    // (1000, 5000, 20000) tem que disparar juntas, nesta chamada, em ordem crescente de atMs.
    const orders = director.update(20_000);
    expect(orders.map((o) => o.cardId)).toEqual(["a", "b", "c"]);

    // Nada mais pendente depois disso.
    expect(director.update(30_000)).toEqual([]);
  });

  it("tempo andando para tras nao reemite onda ja disparada", () => {
    const director = new WaveDirector({
      waves: [{ atMs: 1_000, entries: [{ cardId: "a", count: 1 }] }],
      getCameraYawDeg: () => 0,
      rng: seededRng(3)
    });

    const first = director.update(2_000);
    expect(first).toHaveLength(1);

    // Relogio de parede/troca de aba: elapsedMs recebido cai.
    const backwards = director.update(500);
    expect(backwards).toEqual([]);

    // E mesmo voltando a andar para frente, a onda ja disparada nao reaparece.
    const forwardAgain = director.update(3_000);
    expect(forwardAgain).toEqual([]);
  });

  it("reset() volta todas as ondas a serem emitiveis", () => {
    const director = new WaveDirector({
      waves: [{ atMs: 100, entries: [{ cardId: "a", count: 1 }] }],
      getCameraYawDeg: () => 0,
      rng: seededRng(5)
    });

    expect(director.update(200)).toHaveLength(1);
    expect(director.update(300)).toEqual([]);

    director.reset();

    // Logo apos reset, atMs:100 ainda nao foi alcancado pelo elapsedMs desta chamada.
    expect(director.update(50)).toEqual([]);
    // E volta a disparar quando elapsedMs cruza atMs de novo.
    expect(director.update(150)).toHaveLength(1);
  });
});

describe("WaveDirector — contagem por entrada", () => {
  it("uma WaveEntry com count:N produz exatamente N SpawnOrder, e varias entries somam", () => {
    const director = new WaveDirector({
      waves: [
        {
          atMs: 0,
          entries: [
            { cardId: "swarm", count: 7 },
            { cardId: "brute", count: 2 }
          ]
        }
      ],
      getCameraYawDeg: () => 0,
      rng: seededRng(4)
    });

    const orders = director.update(0);
    expect(orders).toHaveLength(9);
    expect(orders.filter((o) => o.cardId === "swarm")).toHaveLength(7);
    expect(orders.filter((o) => o.cardId === "brute")).toHaveLength(2);
  });
});

describe("WaveDirector — setor re-sorteado por inimigo", () => {
  it("respeita o yaw vigente em cada sorteio dentro da mesma leva, nao um yaw fixo por onda", () => {
    // yaws escolhidos para que cada leitura ALCANCE exatamente um unico flanco:
    // sao os centros dos tres. O criterio de spawn e o alcance (o cone de
    // acao), e nao o enquadramento — com a arena inteira dentro do FOV, "nao
    // enquadrado" seria quase sempre vazio. Ver `reachableSectors` em ArenaArc.
    const yaws = [sectorCenterDeg("center"), sectorCenterDeg("left"), sectorCenterDeg("right")];
    let callIndex = 0;
    const getCameraYawDeg = () => {
      const y = yaws[callIndex % yaws.length];
      callIndex += 1;
      return y;
    };

    // Confere a premissa acima antes de usa-la, para o teste nao depender de uma
    // suposicao errada sobre `reachableSectors`.
    expect(reachableSectors(yaws[0])).toEqual(["center"]);
    expect(reachableSectors(yaws[1])).toEqual(["left"]);
    expect(reachableSectors(yaws[2])).toEqual(["right"]);

    const director = new WaveDirector({
      waves: [{ atMs: 0, entries: [{ cardId: "grunt", count: 3 }] }],
      getCameraYawDeg,
      rng: seededRng(11)
    });

    const orders = director.update(0);
    expect(orders).toHaveLength(3);
    expect(callIndex).toBe(3);

    // inimigo 0 leu yaw 0 -> "center" enquadrado -> nao pode nascer ali
    expect(orders[0].sector).not.toBe("center");
    // inimigo 1 leu yaw -90 -> "left" enquadrado -> nao pode nascer ali
    expect(orders[1].sector).not.toBe("left");
    // inimigo 2 leu yaw 90 -> "right" enquadrado -> nao pode nascer ali
    expect(orders[2].sector).not.toBe("right");
  });
});

describe("WaveDirector — invariantes de colocacao (varredura)", () => {
  const seeds = [1, 2, 3, 7, 42, 1000, 99_999];
  const yaws: number[] = [];
  for (let y = -180; y <= 180; y += 15) yaws.push(y);

  function collectOrders(): SpawnOrder[] {
    const all: SpawnOrder[] = [];
    for (const seed of seeds) {
      for (const yaw of yaws) {
        const director = new WaveDirector({
          waves: [{ atMs: 0, entries: [{ cardId: "grunt", count: 5 }] }],
          getCameraYawDeg: () => yaw,
          rng: seededRng(seed)
        });
        all.push(...director.update(0).map((o) => ({ ...o, __yaw: yaw }) as SpawnOrder & { __yaw: number }));
      }
    }
    return all;
  }

  it("nenhuma SpawnOrder cai em setor enquadrado enquanto existe setor livre (muitos yaws x muitas sementes)", () => {
    for (const seed of seeds) {
      for (const yaw of yaws) {
        const director = new WaveDirector({
          waves: [{ atMs: 0, entries: [{ cardId: "grunt", count: 5 }] }],
          getCameraYawDeg: () => yaw,
          rng: seededRng(seed)
        });

        const framed = new Set<SectorId>(reachableSectors(yaw));
        const free = (["left", "center", "right"] as SectorId[]).filter((s) => !framed.has(s));
        if (free.length === 0) continue; // caso degenerado: sem setor livre, invariante nao se aplica

        const orders = director.update(0);
        for (const order of orders) {
          expect(free).toContain(order.sector);
        }
      }
    }
  });

  it("todo point gerado passa em evaluatePlacement com ok:true (varredura ampla)", () => {
    const orders = collectOrders();
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(evaluatePlacement(order.point)).toEqual({ ok: true });
    }
  });
});
