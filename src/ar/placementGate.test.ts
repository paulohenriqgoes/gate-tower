import { describe, it, expect } from "vitest";
import {
  resolvePreviewState,
  canPlace,
  placementMessage,
  type PlacementPreviewState,
  MAX_OFF_PLANE_PROBES,
  MIN_IN_FRAME_PROBES,
  EXIT_READY_STRIKES
} from "./placementGate";
import type { FootprintCoverage, GroundPlaneFit } from "./hitTestSampling";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

// Helpers para criar mocks
const mockFit: GroundPlaneFit = {
  position: new Vector3(0, 0, 0),
  normal: new Vector3(0, 1, 0)
};

const goodCoverage: FootprintCoverage = {
  inFrame: MIN_IN_FRAME_PROBES,
  offPlane: 0,
  onPlane: MIN_IN_FRAME_PROBES,
  total: 8
};

const outOfFrameCoverage: FootprintCoverage = {
  inFrame: MIN_IN_FRAME_PROBES - 1,
  offPlane: 0,
  onPlane: MIN_IN_FRAME_PROBES - 1,
  total: 8
};

const tooSmallCoverage: FootprintCoverage = {
  inFrame: MIN_IN_FRAME_PROBES,
  offPlane: MAX_OFF_PLANE_PROBES,
  onPlane: MIN_IN_FRAME_PROBES - MAX_OFF_PLANE_PROBES,
  total: 8
};

/**
 * O caso que provocou a inversao da politica: as sondas simplesmente nao
 * devolveram leitura nenhuma. Zero prova a favor E zero prova contra — e o
 * gate tem que LIBERAR, porque silencio de sensor nao e evidencia de que a
 * superficie acabou.
 */
const silentCoverage: FootprintCoverage = {
  inFrame: MIN_IN_FRAME_PROBES,
  offPlane: 0,
  onPlane: 0,
  total: 8
};

describe("resolvePreviewState", () => {
  describe("Regra 1: Tracking Status", () => {
    it("trackingStatus === null → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: null,
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });

    it("trackingStatus !== NORMAL sem fallback → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });

    it("trackingStatus = INITIALIZING → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: "INITIALIZING",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });

    it("trackingStatus = NOT_AVAILABLE → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: "NOT_AVAILABLE",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });

    it("trackingStatus = RELOCALIZING → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: "RELOCALIZING",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });

    it("Perda de tracking derruba imediatamente vindo de ready, sem histerese", () => {
      // Primeiro estado é ready
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      // Perde tracking
      result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("waiting-tracking");
    });
  });

  describe("Fallback com LIMITED", () => {
    it("hasFallbackUnlocked: true + LIMITED + cobertura boa → ready-degraded", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready-degraded");
    });

    it("hasFallbackUnlocked: false + LIMITED → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("waiting-tracking");
    });
  });

  describe("Regra 2: Sem fit ou coverage", () => {
    it("fit === null → searching", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: null,
        coverage: goodCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("searching");
      expect(result.consecutiveFailures).toBe(0);
    });

    it("coverage === null → searching", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: null,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("searching");
      expect(result.consecutiveFailures).toBe(0);
    });

    // O hitTest do SLAM falha em frames avulsos: um `fit` nulo isolado nao pode
    // apagar o contorno que ja estava verde, senao ele pisca sozinho.
    it("um fit nulo isolado NAO derruba ready", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: null,
        coverage: goodCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(1);
    });

    it("dois fits nulos seguidos derrubam para searching", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: null,
        coverage: goodCoverage,
        previous: "ready",
        consecutiveFailures: 1
      });
      expect(result.state).toBe("searching");
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  describe("Regra 3: out-of-frame", () => {
    it("coverage.inFrame < MIN_IN_FRAME_PROBES → out-of-frame", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("out-of-frame");
    });

    it("Uma falha vindo de ready NÃO derruba imediatamente", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(1);
    });

    it("Duas falhas seguidas derrubam o estado", () => {
      // Primeira falha mantém ready
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      // Segunda falha derruba
      result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("out-of-frame");
      expect(result.consecutiveFailures).toBe(0);
    });

    it("Uma aprovação no meio do contador zera os strikes", () => {
      // Primeira falha
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(1);

      // Uma aprovação zera
      result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  describe("Regra 4: too-small", () => {
    it("sondas mudas (nenhuma leitura) LIBERAM — silencio nao e prova contraria", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: silentCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
    });

    it("um unico canto fora do plano NAO reprova", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: { ...silentCoverage, offPlane: MAX_OFF_PLANE_PROBES - 1 },
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
    });

    it("coverage.offPlane >= MAX_OFF_PLANE_PROBES → too-small", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: tooSmallCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("too-small");
    });

    it("Uma falha too-small vindo de ready NÃO derruba", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: tooSmallCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(1);
    });

    it("Duas falhas too-small seguidas derrubam", () => {
      // Primeira falha
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: tooSmallCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      // Segunda falha derruba
      result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: tooSmallCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("too-small");
    });
  });

  describe("Histerese e ready-degraded", () => {
    it("Uma falha vindo de ready-degraded NÃO derruba", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: "ready-degraded",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready-degraded");
      expect(result.consecutiveFailures).toBe(1);
    });

    it("Duas falhas vindo de ready-degraded derrubam", () => {
      // Primeira
      let result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: "ready-degraded",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready-degraded");

      // Segunda derruba
      result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        fit: mockFit,
        coverage: outOfFrameCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("out-of-frame");
    });
  });

  describe("Estados bem-formados", () => {
    it("tracking ok + fit + coverage boa → ready", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(0);
    });

    it("Entrança em ready é imediata", () => {
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      // Continua ready
      result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        fit: mockFit,
        coverage: goodCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  // Estes limiares SAO calibrados em device — afirmar o valor literal de cada
  // um so produz teste que quebra a cada ajuste sem provar nada. O que precisa
  // ficar travado sao os invariantes que, se violados, tornam o gate incoerente.
  describe("Invariantes dos limiares", () => {
    it("exige pelo menos dois vetos para recusar", () => {
      // Com 1, um unico outlier do SLAM reprovaria uma mesa boa — que e como o
      // gate se comportava antes da inversao da politica.
      expect(MAX_OFF_PLANE_PROBES).toBeGreaterThanOrEqual(2);
    });

    it("cabe nas 8 sondas do contorno", () => {
      expect(MIN_IN_FRAME_PROBES).toBeGreaterThan(0);
      expect(MIN_IN_FRAME_PROBES).toBeLessThanOrEqual(8);
    });

    it("a histerese custa pelo menos uma avaliacao", () => {
      // Com 0 a saida de `ready` seria imediata e o contorno voltaria a piscar.
      expect(EXIT_READY_STRIKES).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("canPlace", () => {
  it("canPlace ready → true", () => {
    expect(canPlace("ready")).toBe(true);
  });

  it("canPlace ready-degraded → true", () => {
    expect(canPlace("ready-degraded")).toBe(true);
  });

  it("canPlace waiting-tracking → false", () => {
    expect(canPlace("waiting-tracking")).toBe(false);
  });

  it("canPlace searching → false", () => {
    expect(canPlace("searching")).toBe(false);
  });

  it("canPlace out-of-frame → false", () => {
    expect(canPlace("out-of-frame")).toBe(false);
  });

  it("canPlace too-small → false", () => {
    expect(canPlace("too-small")).toBe(false);
  });
});

describe("placementMessage", () => {
  it("waiting-tracking → null", () => {
    expect(placementMessage("waiting-tracking")).toBeNull();
  });

  it("searching → Procurando uma superficie", () => {
    expect(placementMessage("searching")).toBe("Procurando uma superficie");
  });

  it("out-of-frame → Afaste um pouco o celular", () => {
    expect(placementMessage("out-of-frame")).toBe("Afaste um pouco o celular");
  });

  it("too-small → Aponte para uma superficie maior", () => {
    expect(placementMessage("too-small")).toBe("Aponte para uma superficie maior");
  });

  it("ready → null", () => {
    expect(placementMessage("ready")).toBeNull();
  });

  it("ready-degraded → Precisao reduzida — o tamanho pode variar", () => {
    expect(placementMessage("ready-degraded")).toBe("Precisao reduzida — o tamanho pode variar");
  });
});
