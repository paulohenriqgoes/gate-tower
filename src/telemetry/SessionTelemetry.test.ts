import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { SessionTelemetry } from "./SessionTelemetry";

/** Fonte de tempo controlavel: avanca so quando `tick` e chamado. */
function createFakeClock(startAt = 0) {
  let current = startAt;

  return {
    now: () => current,
    tick: (deltaMs: number) => {
      current += deltaMs;
    },
  };
}

describe("SessionTelemetry", () => {
  describe("log", () => {
    it("registra eventos em ordem cronologica com atMs relativo ao inicio da sessao", () => {
      const clock = createFakeClock(1000);
      const telemetry = new SessionTelemetry({ now: clock.now });

      telemetry.log({ type: "arena_placed", trackingStatus: "NORMAL" });

      clock.tick(250);
      telemetry.log({ type: "enemy_awakened" });

      clock.tick(4000);
      telemetry.log({ type: "deploy_cancelled" });

      const events = telemetry.getEvents();

      expect(events.map((logged) => logged.atMs)).toEqual([0, 250, 4250]);
      expect(events.map((logged) => logged.event.type)).toEqual([
        "arena_placed",
        "enemy_awakened",
        "deploy_cancelled",
      ]);
    });
  });

  describe("getBeat4DurationMs", () => {
    it("devolve o intervalo entre arena_placed e enemy_awakened", () => {
      const clock = createFakeClock();
      const telemetry = new SessionTelemetry({ now: clock.now });

      telemetry.log({ type: "arena_placed", trackingStatus: "NORMAL" });
      clock.tick(12_500);
      telemetry.log({ type: "enemy_awakened" });

      expect(telemetry.getBeat4DurationMs()).toBe(12_500);
    });

    it("devolve null quando falta arena_placed", () => {
      const telemetry = new SessionTelemetry({ now: createFakeClock().now });

      telemetry.log({ type: "enemy_awakened" });

      expect(telemetry.getBeat4DurationMs()).toBeNull();
    });

    it("devolve null quando falta enemy_awakened", () => {
      const telemetry = new SessionTelemetry({ now: createFakeClock().now });

      telemetry.log({ type: "arena_placed", trackingStatus: "NORMAL" });

      expect(telemetry.getBeat4DurationMs()).toBeNull();
    });

    it("devolve null quando nenhum dos dois eventos ocorreu", () => {
      const telemetry = new SessionTelemetry({ now: createFakeClock().now });

      telemetry.log({ type: "deploy_cancelled" });

      expect(telemetry.getBeat4DurationMs()).toBeNull();
    });
  });

  describe("getMinCameraDistance", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("comeca em Infinity antes de qualquer amostra", () => {
      const telemetry = new SessionTelemetry();

      expect(telemetry.getMinCameraDistance()).toBe(Infinity);
    });

    it("guarda o menor valor amostrado e ignora NaN, Infinity e negativos", () => {
      const samples = [3.2, 1.5, NaN, Infinity, -0.4, 2.8];
      let index = 0;
      const telemetry = new SessionTelemetry();

      telemetry.startCameraSampling(() => samples[index++] ?? 2.8, 500);

      for (let i = 0; i < samples.length; i += 1) {
        vi.advanceTimersByTime(500);
      }

      expect(telemetry.getMinCameraDistance()).toBe(1.5);

      telemetry.dispose();
    });
  });

  describe("startCameraSampling / stopCameraSampling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("chamado duas vezes nao duplica o timer", () => {
      const telemetry = new SessionTelemetry();
      const getDistance = vi.fn(() => 5);

      telemetry.startCameraSampling(getDistance, 500);
      telemetry.startCameraSampling(getDistance, 500);

      vi.advanceTimersByTime(500);

      expect(getDistance).toHaveBeenCalledTimes(1);

      telemetry.dispose();
    });

    it("stopCameraSampling para de amostrar", () => {
      const telemetry = new SessionTelemetry();
      const getDistance = vi.fn(() => 5);

      telemetry.startCameraSampling(getDistance, 500);
      vi.advanceTimersByTime(500);
      expect(getDistance).toHaveBeenCalledTimes(1);

      telemetry.stopCameraSampling();
      vi.advanceTimersByTime(2000);

      expect(getDistance).toHaveBeenCalledTimes(1);
    });

    it("dispose para de amostrar", () => {
      const telemetry = new SessionTelemetry();
      const getDistance = vi.fn(() => 5);

      telemetry.startCameraSampling(getDistance, 500);
      telemetry.dispose();
      vi.advanceTimersByTime(2000);

      expect(getDistance).not.toHaveBeenCalled();
    });

    it("usa o intervalo default de 500ms quando nao informado", () => {
      const telemetry = new SessionTelemetry();
      const getDistance = vi.fn(() => 5);

      telemetry.startCameraSampling(getDistance);
      vi.advanceTimersByTime(499);
      expect(getDistance).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(getDistance).toHaveBeenCalledTimes(1);

      telemetry.dispose();
    });
  });

  describe("exportJson", () => {
    it("produz JSON parseavel com os campos do cabecalho", () => {
      const clock = createFakeClock();
      const telemetry = new SessionTelemetry({ now: clock.now });

      telemetry.log({ type: "arena_placed", trackingStatus: "NORMAL" });
      clock.tick(8000);
      telemetry.log({ type: "enemy_awakened" });

      const parsed = JSON.parse(telemetry.exportJson());

      expect(typeof parsed.startedAtIso).toBe("string");
      expect(() => new Date(parsed.startedAtIso).toISOString()).not.toThrow();
      // JSON nao representa Infinity nativamente: JSON.stringify converte para null.
      // Nenhuma amostra de camera foi feita neste teste, entao o valor cru e Infinity.
      expect(telemetry.getMinCameraDistance()).toBe(Infinity);
      expect(parsed.minCameraDistanceMeters).toBeNull();
      expect(parsed.beat4DurationMs).toBe(8000);
      expect(Array.isArray(parsed.events)).toBe(true);
      expect(parsed.events).toHaveLength(2);
      expect(parsed.events[0]).toEqual({
        atMs: 0,
        event: { type: "arena_placed", trackingStatus: "NORMAL" },
      });
      expect(parsed.events[1]).toEqual({ atMs: 8000, event: { type: "enemy_awakened" } });
    });

    it("nunca chama downloadJson (nao ha rede/DOM nesses testes)", () => {
      const telemetry = new SessionTelemetry();
      const downloadSpy = vi.spyOn(telemetry, "downloadJson");

      telemetry.log({ type: "arena_placed", trackingStatus: "NORMAL" });
      telemetry.exportJson();

      expect(downloadSpy).not.toHaveBeenCalled();
    });
  });
});
