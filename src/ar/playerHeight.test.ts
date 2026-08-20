import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PLAYER_HEIGHT_M,
  PLAYER_HEIGHT_MAX_M,
  PLAYER_HEIGHT_MIN_M,
  PLAYER_HEIGHT_STORAGE_KEY,
  formatPlayerHeightM,
  normalizePlayerHeightM,
  readPlayerHeightM,
  stepPlayerHeightM,
  writePlayerHeightM,
  type PlayerHeightStorage,
} from "./playerHeight";

/**
 * O que estes testes protegem nao e aritmetica: e a unica entrada por onde um
 * numero ruim chegaria a `updateCameraProjectionMatrix`. `origin` nao-finito
 * contamina o frame do engine de forma permanente, sem caminho de volta sem
 * reiniciar a sessao — entao a garantia que interessa e que NENHUMA entrada,
 * por pior que seja, sai daqui como algo diferente de um numero da faixa.
 */
describe("normalizePlayerHeightM", () => {
  it("preserva um valor que ja esta na grade", () => {
    expect(normalizePlayerHeightM(1.7)).toBe(1.7);
  });

  it("prende nas pontas da faixa", () => {
    expect(normalizePlayerHeightM(0.4)).toBe(PLAYER_HEIGHT_MIN_M);
    expect(normalizePlayerHeightM(3)).toBe(PLAYER_HEIGHT_MAX_M);
  });

  it("encaixa na grade de 5 cm", () => {
    expect(normalizePlayerHeightM(1.57)).toBe(1.55);
    expect(normalizePlayerHeightM(1.58)).toBe(1.6);
  });

  it("troca qualquer coisa nao-finita pelo default, em vez de propagar", () => {
    // Este e o caso que existe para nao acontecer: um NaN aqui vira um NaN em
    // `origin.y`, e a sessao inteira morre sem mensagem de erro.
    expect(normalizePlayerHeightM(Number.NaN)).toBe(DEFAULT_PLAYER_HEIGHT_M);
    expect(normalizePlayerHeightM(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PLAYER_HEIGHT_M);
    expect(normalizePlayerHeightM(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_PLAYER_HEIGHT_M);
  });
});

describe("stepPlayerHeightM", () => {
  it("anda um passo de 5 cm para cada lado", () => {
    expect(stepPlayerHeightM(1.55, 1)).toBe(1.6);
    expect(stepPlayerHeightM(1.55, -1)).toBe(1.5);
  });

  it("nao acumula erro de ponto flutuante ao longo da faixa", () => {
    // `1.55 + 0.05` em ponto flutuante da 1.6000000000000001. Dez passos
    // seguidos com essa soma deixariam de bater com o rotulo exibido.
    let height = PLAYER_HEIGHT_MIN_M;

    for (let i = 0; i < 15; i += 1) {
      height = stepPlayerHeightM(height, 1);
    }

    expect(height).toBe(PLAYER_HEIGHT_MAX_M);
    expect(formatPlayerHeightM(height)).toBe("2,05 m");
  });

  it("para na ponta em vez de sair da faixa", () => {
    expect(stepPlayerHeightM(PLAYER_HEIGHT_MAX_M, 1)).toBe(PLAYER_HEIGHT_MAX_M);
    expect(stepPlayerHeightM(PLAYER_HEIGHT_MIN_M, -1)).toBe(PLAYER_HEIGHT_MIN_M);
  });
});

describe("persistencia", () => {
  const fakeStorage = (initial: Record<string, string> = {}): PlayerHeightStorage => {
    const data = new Map(Object.entries(initial));

    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    };
  };

  it("le de volta o que escreveu", () => {
    const storage = fakeStorage();

    writePlayerHeightM(storage, 1.75);

    expect(readPlayerHeightM(storage)).toBe(1.75);
  });

  it("devolve o default sem storage", () => {
    expect(readPlayerHeightM(null)).toBe(DEFAULT_PLAYER_HEIGHT_M);
  });

  it("devolve o default quando o valor guardado e lixo", () => {
    const storage = fakeStorage({ [PLAYER_HEIGHT_STORAGE_KEY]: "muito alto" });

    expect(readPlayerHeightM(storage)).toBe(DEFAULT_PLAYER_HEIGHT_M);
  });

  it("normaliza valor guardado fora da faixa por uma versao antiga", () => {
    const storage = fakeStorage({ [PLAYER_HEIGHT_STORAGE_KEY]: "9.99" });

    expect(readPlayerHeightM(storage)).toBe(PLAYER_HEIGHT_MAX_M);
  });

  it("engole o estouro do storage em vez de derrubar a entrada em RA", () => {
    // Safari em navegacao privada estoura no `setItem`. Perder a preferencia e
    // aceitavel; nao entrar em RA por causa dela, nao.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage: PlayerHeightStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };

    expect(() => writePlayerHeightM(storage, 1.6)).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe("formatPlayerHeightM", () => {
  it("usa virgula decimal e duas casas", () => {
    expect(formatPlayerHeightM(1.6)).toBe("1,60 m");
    expect(formatPlayerHeightM(DEFAULT_PLAYER_HEIGHT_M)).toBe("1,55 m");
  });
});
