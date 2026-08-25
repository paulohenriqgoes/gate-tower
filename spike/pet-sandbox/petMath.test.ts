import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  horizontalDistance,
  incidenceDeg,
  pinchToScale,
  presetScaleFor,
  rayPlaneY,
  stepToward,
  yawToward,
} from "./petMath";

describe("rayPlaneY", () => {
  it("acerta o plano olhando para baixo", () => {
    const hit = rayPlaneY({ x: 0, y: 1.5, z: 0 }, { x: 0, y: -1, z: 0 }, 0);

    expect(hit).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("projeta para frente quando o raio e inclinado", () => {
    // Descendo 45 graus apontando para +Z: a queda de 1 m de altura tem que
    // valer exatamente 1 m de avanco.
    const hit = rayPlaneY({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 1 }, 0);

    expect(hit?.z).toBeCloseTo(1, 6);
    expect(hit?.y).toBe(0);
  });

  it("nao normaliza a direcao: o comprimento do vetor nao muda o ponto", () => {
    const curto = rayPlaneY({ x: 0, y: 2, z: 0 }, { x: 1, y: -1, z: 0 }, 0);
    const longo = rayPlaneY({ x: 0, y: 2, z: 0 }, { x: 10, y: -10, z: 0 }, 0);

    expect(curto?.x).toBeCloseTo(longo!.x, 9);
  });

  it("recusa raio paralelo ao plano", () => {
    expect(rayPlaneY({ x: 0, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, 0)).toBeNull();
  });

  it("recusa intersecao ATRAS da camera — o erro de sinal que poe conteudo nas costas", () => {
    // Olhando para CIMA com o plano abaixo: a solucao existe, mas com t < 0.
    expect(rayPlaneY({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 1, z: 0 }, 0)).toBeNull();
  });

  it("segue o plano quando ele e ajustado pelos botoes de chao", () => {
    const hit = rayPlaneY({ x: 0, y: 1.5, z: 0 }, { x: 0, y: -1, z: 1 }, -0.2);

    expect(hit?.y).toBe(-0.2);
    expect(hit?.z).toBeCloseTo(1.7, 6);
  });
});

describe("incidenceDeg", () => {
  it("da 90 graus olhando reto para baixo", () => {
    expect(incidenceDeg({ x: 0, y: -1, z: 0 })).toBeCloseTo(90, 6);
  });

  it("da 45 graus na diagonal", () => {
    expect(incidenceDeg({ x: 0, y: -1, z: 1 })).toBeCloseTo(45, 6);
  });

  it("fica rasante perto do horizonte", () => {
    expect(incidenceDeg({ x: 0, y: -0.02, z: 1 })).toBeLessThan(2);
  });
});

describe("pinchToScale", () => {
  it("dobrar a abertura dos dedos dobra a escala", () => {
    expect(pinchToScale(1, 100, 200)).toBeCloseTo(2, 6);
  });

  it("e relativa ao inicio do gesto, nao acumulativa", () => {
    // Duas leituras do MESMO gesto, a partir da mesma base: a segunda nao pode
    // herdar a primeira. Se herdasse, daria 4 em vez de 2.
    pinchToScale(1, 100, 140);

    expect(pinchToScale(1, 100, 200)).toBeCloseTo(2, 6);
  });

  it("clampa nos dois extremos", () => {
    expect(pinchToScale(1, 100, 1)).toBe(MIN_SCALE);
    expect(pinchToScale(1, 1, 100)).toBe(MAX_SCALE);
  });

  it("sobrevive a distancia inicial degenerada", () => {
    expect(pinchToScale(0.8, 0, 120)).toBeCloseTo(0.8, 6);
  });
});

describe("clampScale", () => {
  it("devolve 1 para entrada nao finita", () => {
    expect(clampScale(Number.NaN)).toBe(1);
  });
});

describe("presetScaleFor", () => {
  it("chao e o tamanho real", () => {
    expect(presetScaleFor("chao")).toBe(1);
  });

  it("mesa e menor que chao", () => {
    expect(presetScaleFor("mesa")).toBeLessThan(presetScaleFor("chao"));
  });
});

describe("stepToward", () => {
  const origem = { x: 0, y: 0, z: 0 };

  it("anda a velocidade pedida", () => {
    const passo = stepToward(origem, { x: 0, y: 0, z: 10 }, 0.35, 1, 0.2);

    expect(passo.position.z).toBeCloseTo(0.35, 6);
    expect(passo.arrived).toBe(false);
  });

  it("nunca passa do alvo, mesmo com dt gigante", () => {
    // dt de 10 s (aba em segundo plano) valeria 3,5 m — o alvo esta a 1 m.
    const passo = stepToward(origem, { x: 0, y: 0, z: 1 }, 0.35, 10, 0.2);

    expect(passo.arrived).toBe(true);
    expect(passo.position.z).toBeLessThanOrEqual(1);
    expect(horizontalDistance(passo.position, { x: 0, y: 0, z: 1 })).toBeCloseTo(0.2, 6);
  });

  it("chega quando entra no raio de parada, e nao no centro da comida", () => {
    const passo = stepToward({ x: 0, y: 0, z: 0.9 }, { x: 0, y: 0, z: 1 }, 0.35, 1, 0.2);

    expect(passo.arrived).toBe(true);
    expect(passo.position.z).toBeCloseTo(0.9, 6);
  });

  it("acompanha o plano quando ele muda de altura no meio do trajeto", () => {
    const passo = stepToward({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.2, z: 10 }, 0.35, 1, 0.2);

    expect(passo.position.y).toBeGreaterThan(-0.2);
    expect(passo.position.y).toBeLessThan(0);
  });

  it("dt zero nao move nada", () => {
    const passo = stepToward(origem, { x: 0, y: 0, z: 10 }, 0.35, 0, 0.2);

    expect(passo.position.z).toBe(0);
  });
});

describe("yawToward", () => {
  it("a frente do mundo canhoto e +Z", () => {
    expect(yawToward({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(0, 6);
  });

  it("+X fica a 90 graus, e nao a -90 — a convencao destra poria o alvo nas costas", () => {
    expect(yawToward({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });

  /*
   * O defeito de device de 2026-08-24: o pet nascia DE COSTAS. A colocacao nao
   * girava nada, entao o +Z do modelo apontava para o +Z do mundo — que e mais
   * ou menos para onde o jogador esta olhando, ou seja, para longe dele.
   *
   * Virar para o jogador e `yawToward(pet, camera)`, e o caso que reproduz o
   * bug e o mais comum de todos: o pet colocado a frente de quem esta parado na
   * origem. A resposta certa e meia volta.
   */
  it("o pet colocado a frente do jogador da meia volta para encara-lo", () => {
    const camera = { x: 0, y: 1.5, z: 0 };
    const pet = { x: 0, y: 0, z: 1.2 };

    expect(Math.abs(yawToward(pet, camera))).toBeCloseTo(Math.PI, 6);
  });

  it("o pet colocado a esquerda olha para a direita", () => {
    const camera = { x: 0, y: 1.5, z: 0 };
    const pet = { x: -1, y: 0, z: 0 };

    expect(yawToward(pet, camera)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe("spike.ts — imports de efeito colateral", () => {
  /*
   * Teste de STRING, e de proposito.
   *
   * `scene.pick` e `scene.createPickingRay` nao existem no `Scene`: eles sao
   * anexados ao prototipo pelo modulo `@babylonjs/core/Culling/ray`, por efeito
   * colateral. Com imports granulares ninguem o traz junto, e o codigo compila,
   * passa no `tsc` e quebra so no primeiro toque, EM DEVICE — foi o que
   * aconteceu na primeira sessao deste spike ("Ray needs to be imported before
   * as it contains a side-effect required by your code", a cada toque, nada
   * colocado).
   *
   * Nao da para pegar isso com teste de comportamento sem subir uma cena com
   * canvas. Da para pegar garantindo que a linha continua la — que e o unico
   * jeito de a remocao acidental doer aqui, e nao a dez metros de casa com o
   * celular na mao.
   */
  it("importa @babylonjs/core/Culling/ray, sem o qual todo toque estoura", () => {
    const fonte = readFileSync(new URL("./spike.ts", import.meta.url), "utf8");

    expect(fonte).toContain('import "@babylonjs/core/Culling/ray"');
  });
});
