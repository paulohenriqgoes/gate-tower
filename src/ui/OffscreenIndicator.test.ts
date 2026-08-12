import { describe, it, expect } from "vitest";

import { resolveEdgeAnchor } from "./OffscreenIndicator";

// Viewport de referencia para os testes: 800x600, margem de 50px.
const WIDTH = 800;
const HEIGHT = 600;
const MARGIN = 50;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

function anchorInBounds(anchor: { x: number; y: number }, bottomLimit = HEIGHT - MARGIN): void {
  expect(anchor.x).toBeGreaterThanOrEqual(MARGIN);
  expect(anchor.x).toBeLessThanOrEqual(WIDTH - MARGIN);
  expect(anchor.y).toBeGreaterThanOrEqual(MARGIN);
  expect(anchor.y).toBeLessThanOrEqual(bottomLimit);
}

describe("resolveEdgeAnchor", () => {
  it("nao mostra seta quando o alvo esta no centro da tela", () => {
    expect(resolveEdgeAnchor(CENTER_X, CENTER_Y, false, WIDTH, HEIGHT, MARGIN)).toBeNull();
  });

  it("nao mostra seta para qualquer ponto dentro do viewport, na frente da camera", () => {
    expect(resolveEdgeAnchor(10, 10, false, WIDTH, HEIGHT, MARGIN)).toBeNull();
    expect(resolveEdgeAnchor(WIDTH - 1, HEIGHT - 1, false, WIDTH, HEIGHT, MARGIN)).toBeNull();
  });

  it("prende a seta na borda direita quando o alvo projeta fora, a direita", () => {
    const anchor = resolveEdgeAnchor(2000, CENTER_Y, false, WIDTH, HEIGHT, MARGIN);

    expect(anchor).not.toBeNull();
    expect(anchor!.x).toBeCloseTo(WIDTH - MARGIN);
    expect(anchor!.y).toBeCloseTo(CENTER_Y);
    expect(anchor!.angleRad).toBeCloseTo(0);
    anchorInBounds(anchor!);
  });

  it("prende a seta na borda esquerda quando o alvo projeta fora, a esquerda", () => {
    const anchor = resolveEdgeAnchor(-1200, CENTER_Y, false, WIDTH, HEIGHT, MARGIN);

    expect(anchor).not.toBeNull();
    expect(anchor!.x).toBeCloseTo(MARGIN);
    expect(anchor!.y).toBeCloseTo(CENTER_Y);
    expect(Math.abs(anchor!.angleRad)).toBeCloseTo(Math.PI);
    anchorInBounds(anchor!);
  });

  it("prende a seta na borda de cima quando o alvo projeta fora, acima", () => {
    const anchor = resolveEdgeAnchor(CENTER_X, -900, false, WIDTH, HEIGHT, MARGIN);

    expect(anchor).not.toBeNull();
    expect(anchor!.x).toBeCloseTo(CENTER_X);
    expect(anchor!.y).toBeCloseTo(MARGIN);
    expect(anchor!.angleRad).toBeCloseTo(-Math.PI / 2);
    anchorInBounds(anchor!);
  });

  it("prende a seta na borda de baixo quando o alvo projeta fora, abaixo", () => {
    const anchor = resolveEdgeAnchor(CENTER_X, 1900, false, WIDTH, HEIGHT, MARGIN);

    expect(anchor).not.toBeNull();
    expect(anchor!.x).toBeCloseTo(CENTER_X);
    expect(anchor!.y).toBeCloseTo(HEIGHT - MARGIN);
    expect(anchor!.angleRad).toBeCloseTo(Math.PI / 2);
    anchorInBounds(anchor!);
  });

  it("o angulo devolvido acompanha a direcao real do alvo em qualquer quadrante", () => {
    // Cima-direita: dx > 0, dy < 0 -> angulo entre -PI/2 e 0.
    const upRight = resolveEdgeAnchor(2000, -900, false, WIDTH, HEIGHT, MARGIN)!;
    expect(upRight.angleRad).toBeGreaterThan(-Math.PI / 2);
    expect(upRight.angleRad).toBeLessThan(0);

    // Baixo-esquerda: dx < 0, dy > 0 -> angulo entre PI/2 e PI.
    const downLeft = resolveEdgeAnchor(-1200, 1900, false, WIDTH, HEIGHT, MARGIN)!;
    expect(downLeft.angleRad).toBeGreaterThan(Math.PI / 2);
    expect(downLeft.angleRad).toBeLessThan(Math.PI);
  });

  it("alvo atras da camera: corrige o espelhamento da projecao e aponta para o lado certo", () => {
    // Mesma projecao bruta (-1000, CENTER_Y) interpretada nos dois cenarios:
    // sem correcao (isBehindCamera=false, como se fosse so um ponto fora a
    // esquerda) a seta vai para a esquerda; com a flag de "atras da camera"
    // ligada, a funcao deve desfazer o espelhamento e apontar para o lado
    // OPOSTO (direita) -- e esse o caso que a spec pede para tratar
    // explicitamente.
    const rawProjectedX = -1000;

    const withoutCorrection = resolveEdgeAnchor(rawProjectedX, CENTER_Y, false, WIDTH, HEIGHT, MARGIN)!;
    const behindCamera = resolveEdgeAnchor(rawProjectedX, CENTER_Y, true, WIDTH, HEIGHT, MARGIN)!;

    expect(withoutCorrection.x).toBeCloseTo(MARGIN); // borda esquerda
    expect(behindCamera.x).toBeCloseTo(WIDTH - MARGIN); // borda direita -- lado oposto, corrigido
    expect(behindCamera.angleRad).toBeCloseTo(0);
    anchorInBounds(behindCamera);
  });

  it("alvo atras da camera, projetando para cima na leitura bruta, aponta para baixo apos a correcao", () => {
    const behindCamera = resolveEdgeAnchor(CENTER_X, -900, true, WIDTH, HEIGHT, MARGIN)!;

    expect(behindCamera.y).toBeCloseTo(HEIGHT - MARGIN);
    expect(behindCamera.angleRad).toBeCloseTo(Math.PI / 2);
    anchorInBounds(behindCamera);
  });

  it("alvo exatamente no eixo da camera (sem componente lateral) nao gera angulo indefinido", () => {
    const anchor = resolveEdgeAnchor(CENTER_X, CENTER_Y, true, WIDTH, HEIGHT, MARGIN)!;

    expect(anchor).not.toBeNull();
    expect(Number.isFinite(anchor.angleRad)).toBe(true);
    anchorInBounds(anchor);
  });

  it("nunca posiciona a seta fora dos limites [margin, dimensao - margin], mesmo em projecoes extremas", () => {
    const extremeInputs: Array<[number, number, boolean]> = [
      [1e6, 1e6, false],
      [-1e6, -1e6, false],
      [1e6, -1e6, true],
      [-1e6, 1e6, true],
      [WIDTH * 3, CENTER_Y, false],
      [CENTER_X, -HEIGHT * 5, true],
    ];

    for (const [x, y, behind] of extremeInputs) {
      const anchor = resolveEdgeAnchor(x, y, behind, WIDTH, HEIGHT, MARGIN);
      expect(anchor).not.toBeNull();
      anchorInBounds(anchor!);
    }
  });

  it("respeita um bottomLimit customizado, para nao invadir a zona thumb do HUD", () => {
    const thumbSafeBottomLimit = HEIGHT * 0.6; // bem acima do default (HEIGHT - MARGIN)
    const anchor = resolveEdgeAnchor(CENTER_X, 1900, false, WIDTH, HEIGHT, MARGIN, thumbSafeBottomLimit)!;

    expect(anchor).not.toBeNull();
    expect(anchor.y).toBeCloseTo(thumbSafeBottomLimit);
    expect(anchor.y).toBeLessThan(HEIGHT - MARGIN);
    anchorInBounds(anchor, thumbSafeBottomLimit);
  });
});
