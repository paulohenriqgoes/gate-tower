import { describe, it, expect } from "vitest";
import {
  resolvePreviewState,
  canPlace,
  blockingProbeThreshold,
  placementMessage,
  placementReason,
  BLOCKING_PROBE_FRACTION,
  MAX_DEVICE_HEIGHT_M,
  MIN_BLOCKING_PROBES,
  MIN_DEVICE_HEIGHT_M,
  EXIT_READY_STRIKES
} from "./placementGate";
import type { ProbeCoverage } from "./hitTestSampling";

/** Altura tipica de alguem de pe segurando o celular. */
const STANDING_HEIGHT_M = 1.45;

/** Quantas sondas de desobstrucao o AR Manager dispara por avaliacao. */
const PROBE_COUNT = 10;

const clearCoverage: ProbeCoverage = {
  inFrame: PROBE_COUNT,
  offPlane: 0,
  onPlane: PROBE_COUNT,
  total: PROBE_COUNT
};

/**
 * O caso que provocou a inversao da politica: as sondas simplesmente nao
 * devolveram leitura nenhuma. Zero prova a favor E zero prova contra — e o
 * gate tem que LIBERAR, porque silencio de sensor nao e evidencia de que ha
 * obstaculo.
 */
const silentCoverage: ProbeCoverage = {
  inFrame: PROBE_COUNT,
  offPlane: 0,
  onPlane: 0,
  total: PROBE_COUNT
};

const blockedCoverage: ProbeCoverage = {
  inFrame: PROBE_COUNT,
  offPlane: blockingProbeThreshold(PROBE_COUNT),
  onPlane: 0,
  total: PROBE_COUNT
};

describe("resolvePreviewState", () => {
  describe("Regra 1: Tracking Status", () => {
    it("trackingStatus === null → waiting-tracking", () => {
      const result = resolvePreviewState({
        trackingStatus: null,
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: clearCoverage,
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
          coverage: clearCoverage,
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
        coverage: clearCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: clearCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("waiting-tracking");
    });
  });

  describe("Fallback com LIMITED", () => {
    it("hasFallbackUnlocked: true + LIMITED + entorno livre → ready-degraded", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: clearCoverage,
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
        coverage: clearCoverage,
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
        coverage: clearCoverage,
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
        coverage: clearCoverage,
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
        coverage: clearCoverage,
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
        coverage: clearCoverage,
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
        coverage: clearCoverage,
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
          coverage: clearCoverage,
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
        coverage: clearCoverage,
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
        coverage: clearCoverage,
        previous: "ready",
        consecutiveFailures: 1
      });
      expect(result.state).toBe("bad-height");
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  describe("Regra 4: prova contraria de obstaculo", () => {
    // O caso de aceite explicito da Etapa 3.
    it("zero prova a favor E zero prova contra → LIBERA", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: silentCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
    });

    it("nenhuma sonda em quadro (o arco inteiro fora do FOV) → LIBERA", () => {
      // O arco tem 180 graus e o celular ve 60: sonda fora de quadro e o caso
      // NORMAL, nao um sinal de problema. Contar isso como recusa devolveria
      // o gate a politica de prova positiva.
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: { inFrame: 0, offPlane: 0, onPlane: 0, total: PROBE_COUNT },
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
    });

    it("nao medi as sondas (coverage null) → LIBERA", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: null,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
    });

    it("uma sonda so no degrau NAO reprova", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: { ...silentCoverage, offPlane: blockingProbeThreshold(PROBE_COUNT) - 1 },
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");
    });

    it("prova contraria acima do limiar → blocked", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: blockedCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("blocked");
    });

    it("uma reprovacao por obstaculo vindo de ready NAO derruba", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: blockedCoverage,
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
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: blockedCoverage,
        previous: "ready",
        consecutiveFailures: 1
      });
      expect(result.state).toBe("blocked");
    });

    it("uma aprovacao no meio do contador zera os strikes", () => {
      let result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: blockedCoverage,
        previous: "ready",
        consecutiveFailures: 0
      });
      expect(result.consecutiveFailures).toBe(1);

      result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: clearCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(0);
    });
  });

  describe("Histerese e ready-degraded", () => {
    it("Uma falha vindo de ready-degraded NAO derruba", () => {
      const result = resolvePreviewState({
        trackingStatus: "LIMITED",
        hasFallbackUnlocked: true,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: blockedCoverage,
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
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: blockedCoverage,
        previous: "ready-degraded",
        consecutiveFailures: 1
      });
      expect(result.state).toBe("blocked");
    });
  });

  describe("Estados bem-formados", () => {
    it("tracking ok + piso + altura + entorno livre → ready", () => {
      const result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: clearCoverage,
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
        coverage: clearCoverage,
        previous: "searching",
        consecutiveFailures: 0
      });
      expect(result.state).toBe("ready");

      result = resolvePreviewState({
        trackingStatus: "NORMAL",
        hasFallbackUnlocked: false,
        deviceHeightM: STANDING_HEIGHT_M,
        coverage: clearCoverage,
        previous: result.state,
        consecutiveFailures: result.consecutiveFailures
      });
      expect(result.state).toBe("ready");
      expect(result.consecutiveFailures).toBe(0);
    });
  });
});

describe("blockingProbeThreshold", () => {
  it("nunca reprova por uma sonda so", () => {
    for (const inFrame of [0, 1, 2, 3, 4, 8, 10, 20]) {
      expect(blockingProbeThreshold(inFrame)).toBeGreaterThanOrEqual(MIN_BLOCKING_PROBES);
    }
  });

  it("e uma FRACAO das sondas em quadro, nao um numero fixo", () => {
    // A propriedade que importa: com muitas sondas o limiar sobe junto. Um
    // limiar constante viraria porcentagem cada vez menor conforme a
    // amostragem crescesse, e passaria a reprovar por ruido.
    expect(blockingProbeThreshold(40)).toBeGreaterThan(blockingProbeThreshold(10));
    expect(blockingProbeThreshold(40)).toBe(Math.ceil(BLOCKING_PROBE_FRACTION * 40));
  });

  it("reproduz o limiar calibrado em device para as 8 sondas antigas", () => {
    // O gate que ancorou no primeiro toque reprovava com 2 de 8. A fracao foi
    // escolhida para preservar exatamente essa severidade.
    expect(blockingProbeThreshold(8)).toBe(2);
  });

  it("nao quebra com entrada negativa", () => {
    expect(blockingProbeThreshold(-5)).toBe(MIN_BLOCKING_PROBES);
  });
});

// Estes limiares SAO calibrados em device — afirmar o valor literal de cada
// um so produz teste que quebra a cada ajuste sem provar nada. O que precisa
// ficar travado sao os invariantes que, se violados, tornam o gate incoerente.
describe("Invariantes dos limiares", () => {
  it("exige pelo menos dois vetos para recusar", () => {
    // Com 1, um unico outlier do SLAM reprovaria um chao bom — que e como o
    // gate se comportava antes da inversao da politica.
    expect(MIN_BLOCKING_PROBES).toBeGreaterThanOrEqual(2);
  });

  it("a fracao de veto e minoria: a maioria das sondas nunca precisa concordar", () => {
    expect(BLOCKING_PROBE_FRACTION).toBeGreaterThan(0);
    expect(BLOCKING_PROBE_FRACTION).toBeLessThan(0.5);
  });

  it("a faixa de altura cobre alguem de pe com o celular na mao", () => {
    expect(MIN_DEVICE_HEIGHT_M).toBeLessThan(1.2);
    expect(MAX_DEVICE_HEIGHT_M).toBeGreaterThan(1.7);
  });

  it("a histerese custa pelo menos uma avaliacao", () => {
    // Com 0 a saida de `ready` seria imediata e o arco voltaria a piscar.
    expect(EXIT_READY_STRIKES).toBeGreaterThanOrEqual(1);
  });
});

describe("canPlace", () => {
  it("libera ready e ready-degraded", () => {
    expect(canPlace("ready")).toBe(true);
    expect(canPlace("ready-degraded")).toBe(true);
  });

  it("recusa todo o resto", () => {
    expect(canPlace("waiting-tracking")).toBe(false);
    expect(canPlace("searching")).toBe(false);
    expect(canPlace("bad-height")).toBe(false);
    expect(canPlace("blocked")).toBe(false);
  });
});

describe("placementMessage", () => {
  it("cala quando quem fala e o coaching overlay ou quando esta tudo certo", () => {
    expect(placementMessage("waiting-tracking")).toBeNull();
    expect(placementMessage("ready")).toBeNull();
  });

  it("da uma instrucao acionavel em cada recusa", () => {
    for (const state of ["searching", "bad-height", "blocked", "ready-degraded"] as const) {
      expect(placementMessage(state)).toBeTruthy();
    }
  });

  it("nao pede mais para mirar e tocar no chao", () => {
    // A arena nao nasce mais num ponto tocado; pedir isso ensinaria o gesto
    // errado.
    for (const state of ["searching", "bad-height", "blocked"] as const) {
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
      "blocked",
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
