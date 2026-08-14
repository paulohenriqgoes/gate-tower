import { describe, expect, it } from "vitest";

import { ProximityTrigger, type WakeStage } from "./ProximityTrigger";

// Defaults do contrato (espelhados aqui de proposito, nao importados: sao
// invariantes de spec, entao um valor errado no arquivo de producao deve
// quebrar o teste em vez de os dois derivarem do mesmo numero).
const PEEK = 30;
const LEAP = 13.5;
const HYSTERESIS = 1.5;
const DWELL_MS = 800;

describe("ProximityTrigger", () => {
  describe("estado inicial", () => {
    it("comeca asleep, sem brilho", () => {
      const trigger = new ProximityTrigger();

      expect(trigger.getStage()).toBe("asleep");
      expect(trigger.getGlowIntensity()).toBe(0);
    });
  });

  describe("histerese asleep <-> peeking", () => {
    it("cai abaixo de peekDistanceUnits -> peeking", () => {
      const trigger = new ProximityTrigger();

      const stage = trigger.update(PEEK - 0.1, 0);

      expect(stage).toBe("peeking");
    });

    it("exatamente no limiar (nao abaixo) ainda NAO entra em peeking", () => {
      const trigger = new ProximityTrigger();

      const stage = trigger.update(PEEK, 0);

      expect(stage).toBe("asleep");
    });

    it("tremor da mao em cima do limiar de peek nao oscila o estado", () => {
      const trigger = new ProximityTrigger();

      // Entra em peeking.
      expect(trigger.update(PEEK - 0.2, 0)).toBe("peeking");

      // Tremula pra cima do limiar puro, mas dentro da banda de histerese
      // (18 + 1.5 = 19.5) — nao pode voltar pra asleep.
      expect(trigger.update(PEEK + 0.3, 100)).toBe("peeking");
      expect(trigger.update(PEEK - 0.2, 200)).toBe("peeking");
      expect(trigger.update(PEEK + 0.5, 300)).toBe("peeking");
    });

    it("sobe de verdade acima de peek + hysteresis -> volta pra asleep", () => {
      const trigger = new ProximityTrigger();

      trigger.update(PEEK - 0.2, 0);
      expect(trigger.getStage()).toBe("peeking");

      const stage = trigger.update(PEEK + HYSTERESIS + 0.1, 100);

      expect(stage).toBe("asleep");
    });
  });

  describe("dwell do salto", () => {
    it("leaping NAO dispara com dwell interrompido", () => {
      const trigger = new ProximityTrigger();

      // Entra na zona de salto e acumula quase todo o dwell.
      trigger.update(LEAP - 0.5, 0);
      trigger.update(LEAP - 0.5, 600);
      expect(trigger.getStage()).toBe("peeking");

      // Sai de verdade da zona (alem da histerese: 7.5 + 1.5 = 9.0) antes de
      // completar 800ms continuos — o acumulador deve zerar.
      trigger.update(LEAP + HYSTERESIS + 0.5, 650);
      expect(trigger.getStage()).toBe("peeking");

      // Volta a entrar e fica so mais 300ms — nao e suficiente, porque o
      // dwell anterior foi descartado (nao acumula em pedacos).
      trigger.update(LEAP - 0.5, 700);
      const stage = trigger.update(LEAP - 0.5, 1000);

      expect(stage).toBe("peeking");
    });

    it("leaping dispara com dwell continuo de leapDwellMs", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5, 0);
      expect(trigger.getStage()).toBe("peeking");

      trigger.update(LEAP - 0.5, DWELL_MS - 1);
      expect(trigger.getStage()).toBe("peeking");

      const stage = trigger.update(LEAP - 0.5, DWELL_MS + 1);

      expect(stage).toBe("leaping");
    });

    it("tremor da mao em cima do limiar de leap nao reseta o dwell", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5, 0);
      // Tremula pra cima do limiar puro mas dentro da banda de histerese —
      // continua contando dwell, nao reseta.
      trigger.update(LEAP + 0.5, 400);
      trigger.update(LEAP - 0.5, 799);
      expect(trigger.getStage()).toBe("peeking");

      const stage = trigger.update(LEAP - 0.5, 801);

      expect(stage).toBe("leaping");
    });
  });

  describe("leaping e terminal", () => {
    it("uma vez leaping, update sempre devolve leaping, mesmo com distancia grande", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5, 0);
      trigger.update(LEAP - 0.5, DWELL_MS + 1);
      expect(trigger.getStage()).toBe("leaping");

      const stage = trigger.update(1000, DWELL_MS + 5000);

      expect(stage).toBe("leaping");
      expect(trigger.getStage()).toBe("leaping");
    });

    it("reset() volta para asleep e zera o brilho", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5, 0);
      trigger.update(LEAP - 0.5, DWELL_MS + 1);
      expect(trigger.getStage()).toBe("leaping");

      trigger.reset();

      expect(trigger.getStage()).toBe("asleep");
      expect(trigger.getGlowIntensity()).toBe(0);

      // E a maquina volta a responder normalmente a distancia depois do reset.
      expect(trigger.update(PEEK - 0.1, 0)).toBe("peeking");
    });
  });

  describe("getGlowIntensity: continuidade, monotonicidade e limites", () => {
    it("fica em [0, 1] e cresce (nao decresce) conforme a distancia diminui", () => {
      // Derivado dos limiares, nunca literal: um valor fixo no meio da faixa
      // deixa de estar no meio assim que os limiares sao recalibrados com
      // telemetria nova, e a lista sai da ordem decrescente sem ninguem
      // perceber que o teste passou a medir outra coisa.
      const midRange = (PEEK + LEAP) / 2;
      const distances = [1000, PEEK + 5, PEEK, PEEK - 1, midRange, LEAP + 1, LEAP, LEAP - 1, 0];
      const trigger = new ProximityTrigger();

      let previousGlow = -1;
      for (const distance of distances) {
        trigger.update(distance, 0);
        const glow = trigger.getGlowIntensity();

        expect(glow).toBeGreaterThanOrEqual(0);
        expect(glow).toBeLessThanOrEqual(1);
        expect(glow).toBeGreaterThanOrEqual(previousGlow);
        previousGlow = glow;
      }
    });

    it("0 bem longe, 1 no limiar do salto (ou mais perto)", () => {
      const trigger = new ProximityTrigger();

      trigger.update(PEEK + 100, 0);
      expect(trigger.getGlowIntensity()).toBe(0);

      trigger.update(LEAP, 0);
      expect(trigger.getGlowIntensity()).toBe(1);

      trigger.update(LEAP - 5, 0);
      expect(trigger.getGlowIntensity()).toBe(1);
    });

    it("distancia negativa -> tratada como 0 (glow 1)", () => {
      const trigger = new ProximityTrigger();

      trigger.update(-50, 0);

      expect(trigger.getGlowIntensity()).toBe(1);
    });

    it("distancia Infinity -> glow 0", () => {
      const trigger = new ProximityTrigger();

      trigger.update(Number.POSITIVE_INFINITY, 0);

      expect(trigger.getGlowIntensity()).toBe(0);
    });

    it("distancia NaN -> glow 0, sem lancar excecao", () => {
      const trigger = new ProximityTrigger();

      expect(() => trigger.update(Number.NaN, 0)).not.toThrow();
      expect(trigger.getGlowIntensity()).toBe(0);
    });

    it("NaN dentro da zona de salto congela o dwell em vez de dispara-lo", () => {
      const trigger = new ProximityTrigger();

      // Entra na zona e acumula quase o dwell inteiro.
      trigger.update(LEAP - 1, 0);
      expect(trigger.update(LEAP - 1, DWELL_MS - 50)).toBe("peeking");

      // O tracking some por bem mais tempo que o dwell restante. Se o
      // acumulador continuasse correndo no escuro, isto viraria "leaping"
      // sem o jogador ter chegado mais perto de nada.
      expect(trigger.update(Number.NaN, DWELL_MS * 5)).toBe("peeking");

      // E o buraco tambem nao pode ser cobrado de uma vez na volta: a
      // primeira leitura boa depois do silencio ainda esta a 50 ms do salto.
      expect(trigger.update(LEAP - 1, DWELL_MS * 5 + 10)).toBe("peeking");
      expect(trigger.update(LEAP - 1, DWELL_MS * 5 + 60)).toBe("leaping");
    });

    it("NaN nao apaga o brilho: segura o ultimo valor bom", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP, 0);
      const glowBefore = trigger.getGlowIntensity();

      trigger.update(Number.NaN, 16);

      expect(trigger.getGlowIntensity()).toBe(glowBefore);
    });

    it("meio da faixa de peeking fica estritamente entre 0 e 1", () => {
      const trigger = new ProximityTrigger();
      const midpoint = (PEEK + LEAP) / 2;

      trigger.update(midpoint, 0);
      const glow = trigger.getGlowIntensity();

      expect(glow).toBeGreaterThan(0);
      expect(glow).toBeLessThan(1);
    });
  });

  describe("robustez do tempo (nowMs)", () => {
    it("nowMs andando pra tras nao trava a maquina nem lanca excecao", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5, 1000);
      expect(() => trigger.update(LEAP - 0.5, 500)).not.toThrow();

      // Tempo negativo nao pode ter sido somado ao dwell.
      expect(trigger.getStage()).toBe("peeking");

      // E a maquina continua funcional depois: reaplica dwell suficiente a
      // partir do novo relogio (500) e ainda assim dispara o salto.
      const stage = trigger.update(LEAP - 0.5, 500 + DWELL_MS + 1);
      expect(stage).toBe("leaping");
    });

    it("salto grande de nowMs nao trava a maquina — so acelera o dwell", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5, 0);
      const stage = trigger.update(LEAP - 0.5, 1_000_000);

      expect(stage).toBe("leaping");
    });
  });

  describe("update() e getStage() concordam sempre", () => {
    it("o retorno de update() e sempre igual ao que getStage() devolve em seguida", () => {
      const trigger = new ProximityTrigger();
      const sequence: Array<[number, number]> = [
        [100, 0],
        [PEEK - 1, 100],
        [LEAP - 1, 300],
        [LEAP - 1, 1200]
      ];

      for (const [distance, nowMs] of sequence) {
        const returned: WakeStage = trigger.update(distance, nowMs);
        expect(trigger.getStage()).toBe(returned);
      }
    });
  });

  describe("config customizada", () => {
    it("aceita config parcial e mantem defaults nos campos omitidos", () => {
      const trigger = new ProximityTrigger({ leapDwellMs: 100 });

      trigger.update(LEAP - 0.5, 0);
      const stage = trigger.update(LEAP - 0.5, 101);

      expect(stage).toBe("leaping");
    });
  });
});
