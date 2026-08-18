import { describe, it, expect } from "vitest";
import {
  resolvePreviewState,
  canPlace,
  placementMessage,
  placementReason,
  MAX_DEVICE_HEIGHT_M,
  MIN_DEVICE_HEIGHT_M,
  EXIT_READY_STRIKES
} from "./placementGate";

/** Altura tipica de alguem de pe segurando o celular. */
const STANDING_HEIGHT_M = 1.45;

describe("resolvePreviewState", () => {
  describe("Regra 1: Tracking Status", () => {
    it("trackingStatus === null → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: null,
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });

    it("trackingStatus !== NORMAL sem fallback → waiting-tracking", () => {
      for (const status of ["LIMITED", "INITIALIZING", "NOT_AVAILABLE", "RELOCALIZING"] as const) {
        const result = resolvePreviewState({
          trackingStatus: status,
          hasFallbackUnlocked: false,
          deviceHeightM: STANDING_HEIGHT_M,
          previous: "ready",
          consecutiveFailures: 0
        });
        expect(result.state).toBe("waiting-tracking");
      }
    });

    it("Perda de tracking derruba imediatamente vindo de ready, sem histerese", () => {
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("waiting-tracking");
    });
  });

  describe("Fallback com LIMITED", () => {
    it("hasFallbackUnlocked: true + LIMITED + altura ok → ready-degraded", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready-degraded");
    });

    it("hasFallbackUnlocked: false + LIMITED → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });
  });

  describe("Regra 2: piso encontrado", () => {
    it("sem altura medida → searching", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: null,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("searching");
      expect(result.consecutiveFailures).toBe(0);
    });

    // O hitTest do SLAM falha em frames avulsos: uma medicao nula isolada nao
    // pode apagar o arco que ja estava verde, senao ele pisca sozinho.
    it("uma medicao nula isolada NAO derruba ready", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: null,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(1);
    });

    it("duas medicoes nulas seguidas derrubam para searching", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: null,
        previous: "ready",
        consecutiveFailures: 1
      });
      expect(result.state).toBe("searching");
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  describe("Regra 3: altura do device", () => {
    it("piso alto demais (mesa sob o celular) → bad-height", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: MIN_DEVICE_HEIGHT_M - 0.05,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("bad-height");
    });

    it("piso fundo demais (escala nao convergiu) → bad-height", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: MAX_DEVICE_HEIGHT_M + 0.05,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("bad-height");
    });

    it("aceita as duas pontas da faixa", () => {
      for (const height of [MIN_DEVICE_HEIGHT_M, MAX_DEVICE_HEIGHT_M]) {
        const result = resolvePreviewState({
          trackingStatus: "NORMAL",
          hasFallbackUnlocked: false,
          deviceHeightM: height,
          previous: "searching",
          consecutiveFailures: 0
        });
        expect(result.state).toBe("ready");
      }
    });

    it("uma altura fora da faixa vindo de ready NAO derruba imediatamente", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: 0.2,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(1);
    });

    it("duas seguidas derrubam", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: 0.2,
        previous: "ready",
        consecutiveFailures: 1
      });
      expect(result.state).toBe("bad-height");
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  describe("Histerese e ready-degraded", () => {
    // A histerese vale IGUAL vindo de ready-degraded: quem entrou pelo escape
    // de ambiente sem textura nao pode ser mais fragil que quem entrou por
    // NORMAL — seria justamente o ambiente ruim recebendo o gate mais nervoso.
    it("Uma falha vindo de ready-degraded NAO derruba", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        deviceHeightM: null,
        previous: "ready-degraded",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready-degraded");
      expect(result.consecutiveFailures).toBe(1);
    });

    it("Duas falhas vindo de ready-degraded derrubam", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        deviceHeightM: null,
        previous: "ready-degraded",
        consecutiveFailures: 1
      });
      expect(result.state).toBe("searching");
    });
  });

  describe("Estados bem-formados", () => {
    it("tracking ok + piso + altura na faixa → ready", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(0);
    });

    it("Entrada em ready e imediata e estavel", () => {
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(0);
    });
  });
});

// Estes limiares SAO calibrados em device — afirmar o valor literal de cada
// um so produz teste que quebra a cada ajuste sem provar nada. O que precisa
// ficar travado sao os invariantes que, se violados, tornam o gate incoerente.

describe("canPlace", () => {
  it("libera ready e ready-degraded", () => {
    expect(canPlace("ready")).toBe(true);
    expect(canPlace("ready-degraded")).toBe(true);
  });

  it("recusa todo o resto", () => {
    expect(canPlace("waiting-tracking")).toBe(false);
    expect(canPlace("searching")).toBe(false);
    expect(canPlace("bad-height")).toBe(false);
  });
});

describe("placementMessage", () => {
  it("cala quando quem fala e o coaching overlay ou quando esta tudo certo", () => {
    expect(placementMessage("waiting-tracking")).toBeNull();
    expect(placementMessage("ready")).toBeNull();
  });

  it("da uma instrucao acionavel em cada recusa", () => {
    for (const state of ["searching", "bad-height", "ready-degraded"] as const) {
      expect(placementMessage(state)).toBeTruthy();
    }
  });

  it("nao pede mais para mirar e tocar no chao", () => {
    // A arena nao nasce mais num ponto tocado; pedir isso ensinaria o gesto
    // errado.
    for (const state of ["searching", "bad-height"] as const) {
      expect(placementMessage(state)).not.toMatch(/toque/i);
    }
  });
});

describe("placementReason", () => {
  it("responde para todo estado, inclusive os silenciosos", () => {
    for (const state of [
      "waiting-tracking",
      "searching",
      "bad-height",
      "ready",
      "ready-degraded"
    ] as const) {
      expect(placementReason(state).length).toBeGreaterThan(0);
    }
  });

  it("marca os dois estados que liberam com o mesmo motivo", () => {
    expect(placementReason("ready")).toBe("ok");
    expect(placementReason("ready-degraded")).toBe("ok");
  });
});
