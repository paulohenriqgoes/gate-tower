import { describe, expect, it } from "vitest";

import { ProximityTrigger, type WakeStage } from "./ProximityTrigger";

// Defaults do contrato (espelhados aqui de proposito, nao importados: sao
// invariantes de spec, entao um valor errado no arquivo de producao deve
// quebrar o teste em vez de os dois derivarem do mesmo numero).
// Etapa 2: os valores sao METROS direto (1 unidade do Babylon = 1 metro,
// `src/arena/metrics.ts`) — antes eram "unidades autorais" convertidas por um
// fator global (~0,0333) que esta etapa aboliu; o significado real
// (1,0 m / 0,45 m / 0,05 m) nao mudou.
const PEEK = 1.0;
const LEAP = 0.45;
const HYSTERESIS = 0.05;
const DWELL_MS = 800;

/**
 * As margens/tremores abaixo (antes literais como 0.1, 0.3, 1, 5 em unidades
 * autorais) escalam pelo MESMO fator global que a Etapa 2 aboliu (~0,0333):
 * a faixa entre `LEAP` e `PEEK` encolheu de 16,5 unidades para 0,55 m, entao
 * uma margem de "tremor da mao" que antes era pequena frente a faixa precisa
 * encolher junto para continuar pequena — sem isso ela passa a ULTRAPASSAR a
 * banda de histerese (`HYSTERESIS` = 0,05 m) e os testes de "nao oscila"
 * passam a falhar por engano.
 */
const MARGIN_SCALE = 1 / 30;

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

      const stage = trigger.update(PEEK - 0.1 * MARGIN_SCALE, 0);

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
      expect(trigger.update(PEEK - 0.2 * MARGIN_SCALE, 0)).toBe("peeking");

      // Tremula pra cima do limiar puro, mas dentro da banda de histerese
      // (PEEK + HYSTERESIS = 1,05 m) — nao pode voltar pra asleep.
      expect(trigger.update(PEEK + 0.3 * MARGIN_SCALE, 100)).toBe("peeking");
      expect(trigger.update(PEEK - 0.2 * MARGIN_SCALE, 200)).toBe("peeking");
      expect(trigger.update(PEEK + 0.5 * MARGIN_SCALE, 300)).toBe("peeking");
    });

    it("sobe de verdade acima de peek + hysteresis -> volta pra asleep", () => {
      const trigger = new ProximityTrigger();

      trigger.update(PEEK - 0.2 * MARGIN_SCALE, 0);
      expect(trigger.getStage()).toBe("peeking");

      const stage = trigger.update(PEEK + HYSTERESIS + 0.1 * MARGIN_SCALE, 100);

      expect(stage).toBe("asleep");
    });
  });

  describe("dwell do salto", () => {
    it("leaping NAO dispara com dwell interrompido", () => {
      const trigger = new ProximityTrigger();

      // Entra na zona de salto e acumula quase todo o dwell.
      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 0);
      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 600);
      expect(trigger.getStage()).toBe("peeking");

      // Sai de verdade da zona (alem da histerese) antes de completar 800ms
      // continuos — o acumulador deve zerar.
      trigger.update(LEAP + HYSTERESIS + 0.5 * MARGIN_SCALE, 650);
      expect(trigger.getStage()).toBe("peeking");

      // Volta a entrar e fica so mais 300ms — nao e suficiente, porque o
      // dwell anterior foi descartado (nao acumula em pedacos).
      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 700);
      const stage = trigger.update(LEAP - 0.5 * MARGIN_SCALE, 1000);

      expect(stage).toBe("peeking");
    });

    it("leaping dispara com dwell continuo de leapDwellMs", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 0);
      expect(trigger.getStage()).toBe("peeking");

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, DWELL_MS - 1);
      expect(trigger.getStage()).toBe("peeking");

      const stage = trigger.update(LEAP - 0.5 * MARGIN_SCALE, DWELL_MS + 1);

      expect(stage).toBe("leaping");
    });

    it("tremor da mao em cima do limiar de leap nao reseta o dwell", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 0);
      // Tremula pra cima do limiar puro mas dentro da banda de histerese —
      // continua contando dwell, nao reseta.
      trigger.update(LEAP + 0.5 * MARGIN_SCALE, 400);
      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 799);
      expect(trigger.getStage()).toBe("peeking");

      const stage = trigger.update(LEAP - 0.5 * MARGIN_SCALE, 801);

      expect(stage).toBe("leaping");
    });
  });

  describe("leaping e terminal", () => {
    it("uma vez leaping, update sempre devolve leaping, mesmo com distancia grande", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 0);
      trigger.update(LEAP - 0.5 * MARGIN_SCALE, DWELL_MS + 1);
      expect(trigger.getStage()).toBe("leaping");

      const stage = trigger.update(1000, DWELL_MS + 5000);

      expect(stage).toBe("leaping");
      expect(trigger.getStage()).toBe("leaping");
    });

    it("reset() volta para asleep e zera o brilho", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 0);
      trigger.update(LEAP - 0.5 * MARGIN_SCALE, DWELL_MS + 1);
      expect(trigger.getStage()).toBe("leaping");

      trigger.reset();

      expect(trigger.getStage()).toBe("asleep");
      expect(trigger.getGlowIntensity()).toBe(0);

      // E a maquina volta a responder normalmente a distancia depois do reset.
      expect(trigger.update(PEEK - 0.1 * MARGIN_SCALE, 0)).toBe("peeking");
    });
  });

  describe("getGlowIntensity: continuidade, monotonicidade e limites", () => {
    it("fica em [0, 1] e cresce (nao decresce) conforme a distancia diminui", () => {
      // Derivado dos limiares, nunca literal: um valor fixo no meio da faixa
      // deixa de estar no meio assim que os limiares sao recalibrados com
      // telemetria nova, e a lista sai da ordem decrescente sem ninguem
      // perceber que o teste passou a medir outra coisa. Os offsets de +-1/+-5
      // escalam por `MARGIN_SCALE` pelo mesmo motivo do topo do arquivo —
      // sem isso eles ultrapassam a faixa [LEAP, PEEK] inteira (hoje so
      // 0,55 m) e a sequencia deixa de ser monotonica em distancia.
      const midRange = (PEEK + LEAP) / 2;
      const distances = [
        1000,
        PEEK + 5 * MARGIN_SCALE,
        PEEK,
        PEEK - 1 * MARGIN_SCALE,
        midRange,
        LEAP + 1 * MARGIN_SCALE,
        LEAP,
        LEAP - 1 * MARGIN_SCALE,
        0,
      ];
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

      trigger.update(LEAP - 5 * MARGIN_SCALE, 0);
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
      trigger.update(LEAP - 1 * MARGIN_SCALE, 0);
      expect(trigger.update(LEAP - 1 * MARGIN_SCALE, DWELL_MS - 50)).toBe("peeking");

      // O tracking some por bem mais tempo que o dwell restante. Se o
      // acumulador continuasse correndo no escuro, isto viraria "leaping"
      // sem o jogador ter chegado mais perto de nada.
      expect(trigger.update(Number.NaN, DWELL_MS * 5)).toBe("peeking");

      // E o buraco tambem nao pode ser cobrado de uma vez na volta: a
      // primeira leitura boa depois do silencio ainda esta a 50 ms do salto.
      expect(trigger.update(LEAP - 1 * MARGIN_SCALE, DWELL_MS * 5 + 10)).toBe("peeking");
      expect(trigger.update(LEAP - 1 * MARGIN_SCALE, DWELL_MS * 5 + 60)).toBe("leaping");
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

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 1000);
      expect(() => trigger.update(LEAP - 0.5 * MARGIN_SCALE, 500)).not.toThrow();

      // Tempo negativo nao pode ter sido somado ao dwell.
      expect(trigger.getStage()).toBe("peeking");

      // E a maquina continua funcional depois: reaplica dwell suficiente a
      // partir do novo relogio (500) e ainda assim dispara o salto.
      const stage = trigger.update(LEAP - 0.5 * MARGIN_SCALE, 500 + DWELL_MS + 1);
      expect(stage).toBe("leaping");
    });

    it("salto grande de nowMs nao trava a maquina — so acelera o dwell", () => {
      const trigger = new ProximityTrigger();

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 0);
      const stage = trigger.update(LEAP - 0.5 * MARGIN_SCALE, 1_000_000);

      expect(stage).toBe("leaping");
    });
  });

  describe("update() e getStage() concordam sempre", () => {
    it("o retorno de update() e sempre igual ao que getStage() devolve em seguida", () => {
      const trigger = new ProximityTrigger();
      const sequence: Array<[number, number]> = [
        [100, 0],
        [PEEK - 1 * MARGIN_SCALE, 100],
        [LEAP - 1 * MARGIN_SCALE, 300],
        [LEAP - 1 * MARGIN_SCALE, 1200]
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

      trigger.update(LEAP - 0.5 * MARGIN_SCALE, 0);
      const stage = trigger.update(LEAP - 0.5 * MARGIN_SCALE, 101);

      expect(stage).toBe("leaping");
    });
  });
});
