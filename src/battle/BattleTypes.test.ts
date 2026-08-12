import { describe, expect, it } from "vitest";

import { resolveMatchResultByHpPct } from "./BattleTypes";

describe("resolveMatchResultByHpPct", () => {
  it("vitoria quando o jogador tem HP percentual maior", () => {
    expect(resolveMatchResultByHpPct(80, 40)).toBe("win");
  });

  it("derrota quando o inimigo tem HP percentual maior", () => {
    expect(resolveMatchResultByHpPct(30, 65)).toBe("loss");
  });

  it("empate quando os percentuais sao iguais", () => {
    expect(resolveMatchResultByHpPct(50, 50)).toBe("draw");
  });

  it("empate quando as duas torres estao destruidas (0% vs 0%)", () => {
    expect(resolveMatchResultByHpPct(0, 0)).toBe("draw");
  });

  it("vitoria com a torre inimiga destruida (100% vs 0%)", () => {
    expect(resolveMatchResultByHpPct(100, 0)).toBe("win");
  });

  it("derrota com a torre do jogador destruida (0% vs 100%)", () => {
    expect(resolveMatchResultByHpPct(0, 100)).toBe("loss");
  });
});
