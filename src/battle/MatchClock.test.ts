import { describe, expect, it } from "vitest";

import { MatchClock } from "./MatchClock";

/** Fonte de tempo controlavel: avanca so quando `tick` e chamado (mesmo padrao de SessionTelemetry.test.ts). */
function createFakeClock(startAt = 0) {
  let current = startAt;

  return {
    now: () => current,
    tick: (deltaMs: number) => {
      current += deltaMs;
    },
  };
}

describe("MatchClock", () => {
  it("antes de start(), fica parado com a duracao default (3min) inteira restante", () => {
    const clock = new MatchClock();

    expect(clock.isRunning()).toBe(false);
    expect(clock.getElapsedMs()).toBe(0);
    expect(clock.getRemainingMs()).toBe(180_000);
  });

  it("aceita duracao customizada", () => {
    const clock = new MatchClock({ durationMs: 10_000 });

    expect(clock.getRemainingMs()).toBe(10_000);
  });

  it("start() liga o relogio; getRemainingMs cai conforme o now() injetado avanca", () => {
    const fake = createFakeClock(1_000);
    const clock = new MatchClock({ durationMs: 10_000, now: fake.now });

    clock.start();
    expect(clock.isRunning()).toBe(true);
    expect(clock.getRemainingMs()).toBe(10_000);

    fake.tick(4_000);
    expect(clock.getElapsedMs()).toBe(4_000);
    expect(clock.getRemainingMs()).toBe(6_000);
  });

  it("nunca pausa: sem nenhuma chamada de tick() por 10s, getRemainingMs reflete o tempo real assim que consultado", () => {
    const fake = createFakeClock();
    const clock = new MatchClock({ durationMs: 30_000, now: fake.now });
    clock.start();

    // Simula o app 10s sem renderizar nenhum frame (arena fora do quadro,
    // tracking oscilando, etc.) — nenhum tick() e chamado nesse intervalo.
    fake.tick(10_000);

    expect(clock.getElapsedMs()).toBe(10_000);
    expect(clock.getRemainingMs()).toBe(20_000);
  });

  it("onExpiredObservable dispara uma unica vez quando tick() cruza a duracao total, e o relogio para", () => {
    const fake = createFakeClock();
    const clock = new MatchClock({ durationMs: 1_000, now: fake.now });
    let expiredCount = 0;
    clock.onExpiredObservable.add(() => {
      expiredCount += 1;
    });

    clock.start();

    fake.tick(500);
    clock.tick();
    expect(expiredCount).toBe(0);
    expect(clock.isRunning()).toBe(true);

    fake.tick(600);
    clock.tick();
    expect(expiredCount).toBe(1);
    expect(clock.isRunning()).toBe(false);

    // tick() apos expirar e no-op (relogio ja parado) — nao dispara de novo.
    fake.tick(5_000);
    clock.tick();
    expect(expiredCount).toBe(1);
  });

  it("onFinalMinuteObservable dispara exatamente uma vez ao cruzar 60s restantes, mesmo com tick() a 60fps", () => {
    const fake = createFakeClock();
    const clock = new MatchClock({ durationMs: 180_000, now: fake.now });
    let finalMinuteCount = 0;
    clock.onFinalMinuteObservable.add(() => {
      finalMinuteCount += 1;
    });

    clock.start();

    const frameMs = 1000 / 60;
    let elapsed = 0;

    // Ate pouco antes do ultimo minuto (elapsed < 119s): nao dispara ainda.
    while (elapsed < 119_000) {
      fake.tick(frameMs);
      clock.tick();
      elapsed += frameMs;
    }
    expect(finalMinuteCount).toBe(0);

    // Atravessa a marca de 120s (60s restantes) chamando tick() varias vezes
    // por "segundo" simulado, como o render loop real faria.
    while (elapsed < 130_000) {
      fake.tick(frameMs);
      clock.tick();
      elapsed += frameMs;
    }

    expect(finalMinuteCount).toBe(1);
  });

  it("stop() congela o tempo restante e decorrido, mesmo que o now() injetado continue avancando", () => {
    const fake = createFakeClock();
    const clock = new MatchClock({ durationMs: 10_000, now: fake.now });
    clock.start();

    fake.tick(3_000);
    clock.stop();
    expect(clock.isRunning()).toBe(false);
    expect(clock.getElapsedMs()).toBe(3_000);
    expect(clock.getRemainingMs()).toBe(7_000);

    fake.tick(5_000);
    expect(clock.getElapsedMs()).toBe(3_000);
    expect(clock.getRemainingMs()).toBe(7_000);
  });

  it("start() apos stop() reinicia a contagem do zero", () => {
    const fake = createFakeClock();
    const clock = new MatchClock({ durationMs: 10_000, now: fake.now });

    clock.start();
    fake.tick(3_000);
    clock.stop();

    clock.start();
    expect(clock.getElapsedMs()).toBe(0);
    expect(clock.getRemainingMs()).toBe(10_000);
  });

  it("dispose() para o relogio e limpa os observables", () => {
    const clock = new MatchClock();
    clock.start();

    clock.dispose();

    expect(clock.isRunning()).toBe(false);
    expect(clock.onExpiredObservable.hasObservers()).toBe(false);
    expect(clock.onFinalMinuteObservable.hasObservers()).toBe(false);
  });
});
