import { describe, expect, it } from "vitest";

import { DEFAULT_FRAMING_CONFIG, FramingTrigger } from "./FramingTrigger";

const { dwellMs, halfConeDeg, releaseMarginDeg } = DEFAULT_FRAMING_CONFIG;

describe("FramingTrigger", () => {
  it("comeca fora, sem progresso", () => {
    const trigger = new FramingTrigger();

    expect(trigger.getStage()).toBe("away");
    expect(trigger.getProgress()).toBe(0);
  });

  it("mira continua no centro dispara depois do dwell", () => {
    const trigger = new FramingTrigger();

    // A primeira leitura so ancora o relogio — nao ha delta anterior para somar.
    expect(trigger.update(0, 0)).toBe("aiming");
    expect(trigger.update(0, dwellMs / 2)).toBe("aiming");
    expect(trigger.getProgress()).toBeCloseTo(0.5, 6);

    expect(trigger.update(0, dwellMs)).toBe("triggered");
    expect(trigger.getProgress()).toBe(1);
  });

  it("olhar para o lado NAO dispara, por mais tempo que passe", () => {
    const trigger = new FramingTrigger();
    const wayOff = halfConeDeg + releaseMarginDeg + 15;

    trigger.update(wayOff, 0);
    trigger.update(wayOff, 10_000);

    expect(trigger.getStage()).toBe("away");
    expect(trigger.getProgress()).toBe(0);
  });

  it("o dwell tem de ser CONTINUO: olhar de relance tres vezes nao conta", () => {
    const trigger = new FramingTrigger();
    const wayOff = halfConeDeg + releaseMarginDeg + 15;
    let clock = 0;

    for (let glance = 0; glance < 3; glance += 1) {
      trigger.update(0, clock);
      clock += dwellMs * 0.6;
      trigger.update(0, clock);
      // Desvia o olhar de verdade: zera.
      clock += 50;
      trigger.update(wayOff, clock);
      clock += 50;
    }

    expect(trigger.getStage()).toBe("away");
    expect(trigger.getProgress()).toBe(0);
  });

  it("histerese: tremor na fronteira do cone nao zera o dwell", () => {
    const trigger = new FramingTrigger();

    trigger.update(0, 0);
    trigger.update(0, dwellMs * 0.8);
    expect(trigger.getProgress()).toBeCloseTo(0.8, 6);

    // Passou do cone, mas ainda dentro da margem de soltura: continua valendo.
    expect(trigger.update(halfConeDeg + releaseMarginDeg - 0.5, dwellMs * 0.9)).toBe("aiming");
    expect(trigger.getProgress()).toBeCloseTo(0.9, 6);

    // Agora saiu de verdade.
    expect(trigger.update(halfConeDeg + releaseMarginDeg + 0.5, dwellMs)).toBe("away");
    expect(trigger.getProgress()).toBe(0);
  });

  it("leitura ausente CONGELA: nao acumula e nao descarta", () => {
    const trigger = new FramingTrigger();

    trigger.update(0, 0);
    trigger.update(0, dwellMs * 0.7);
    expect(trigger.getProgress()).toBeCloseTo(0.7, 6);

    // Dez segundos de tracking perdido no meio da mira.
    expect(trigger.update(null, dwellMs * 0.7 + 10_000)).toBe("aiming");
    expect(trigger.getProgress()).toBeCloseTo(0.7, 6);

    // Ao voltar, o tempo parado NAO conta como mira — o dwell retoma de onde
    // estava. Sem isto, um segundo de LIMITED dispararia a partida sozinho.
    trigger.update(0, dwellMs * 0.7 + 10_000);
    expect(trigger.getProgress()).toBeCloseTo(0.7, 6);

    expect(trigger.update(0, dwellMs * 0.7 + 10_000 + dwellMs * 0.3)).toBe("triggered");
  });

  it("`triggered` e terminal: desviar o olhar depois nao desfaz", () => {
    const trigger = new FramingTrigger();

    trigger.update(0, 0);
    expect(trigger.update(0, dwellMs)).toBe("triggered");

    expect(trigger.update(180, dwellMs + 5_000)).toBe("triggered");
    expect(trigger.getProgress()).toBe(1);
  });

  it("relogio andando para tras nao soma tempo negativo", () => {
    const trigger = new FramingTrigger();

    trigger.update(0, 10_000);
    trigger.update(0, 9_000);

    expect(trigger.getProgress()).toBe(0);
    expect(trigger.getStage()).toBe("aiming");
  });

  it("reset devolve o gatilho ao inicio", () => {
    const trigger = new FramingTrigger();

    trigger.update(0, 0);
    trigger.update(0, dwellMs);
    expect(trigger.getStage()).toBe("triggered");

    trigger.reset();

    expect(trigger.getStage()).toBe("away");
    expect(trigger.getProgress()).toBe(0);
  });

  it("respeita o wrap de angulo: offset de -179 e tao fora quanto +179", () => {
    const trigger = new FramingTrigger();

    trigger.update(-179, 0);
    trigger.update(-179, 10_000);

    expect(trigger.getStage()).toBe("away");
  });
});
