import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it } from "vitest";

import { PLAYER_EYE_HEIGHT_M, playerYawDeg, type HeadingSource } from "./arenaFraming";
import { MAX_DEVICE_HEIGHT_M, MIN_DEVICE_HEIGHT_M } from "../ar/placementGate";
import { sectorOf } from "../arena/ArenaArc";

/**
 * Camera de mentira: so sabe para onde olha. E o suficiente porque `playerYawDeg`
 * so pergunta isso — instanciar uma `Camera` de verdade exigiria uma `Scene`, e
 * uma `Scene` exigiria um contexto WebGL que nao existe no vitest.
 */
function lookingAt(x: number, z: number): HeadingSource {
  return { getDirection: () => new Vector3(x, 0, z) };
}

describe("playerYawDeg — a convencao de angulo do modo tela", () => {
  it("chama de 0 a direcao -Z, que e o azimute 0 do arco", () => {
    expect(playerYawDeg(lookingAt(0, -1))).toBe(0);
  });

  it("da yaw POSITIVO quando o jogador vira para a direita dele (+X)", () => {
    // Este e o teste que importa. Um sinal trocado aqui nao quebra nada
    // visivelmente — so faz o alerta de flanco acender do lado errado e o
    // inimigo nascer no setor que o jogador esta encarando, tres modulos
    // adiante. Ver a mesma preocupacao em `src/ar/arenaHeading.ts`.
    expect(playerYawDeg(lookingAt(1, 0))).toBe(90);
    expect(playerYawDeg(lookingAt(-1, 0))).toBe(-90);
  });

  it("concorda com `sectorOf` sobre qual flanco o jogador esta encarando", () => {
    expect(sectorOf(playerYawDeg(lookingAt(1, 0)))).toBe("right");
    expect(sectorOf(playerYawDeg(lookingAt(-1, 0)))).toBe("left");
    expect(sectorOf(playerYawDeg(lookingAt(0, -1)))).toBe("center");
  });

  it("ignora a inclinacao: olhar para o chao nao muda de flanco", () => {
    const lookingDownAndRight: HeadingSource = {
      getDirection: () => new Vector3(0.5, -0.85, -0.1),
    };

    // A componente Y e descartada, entao o que sobra e um olhar bem para a
    // direita — e nao um angulo qualquer contaminado pela inclinacao.
    expect(sectorOf(playerYawDeg(lookingDownAndRight))).toBe("right");
  });

  it("devolve um numero estavel quando o jogador olha reto para baixo", () => {
    // Projecao horizontal nula: nao ha heading definido. O contrato e devolver
    // um valor arbitrario mas CONSTANTE, nunca NaN — quem consome (o diretor de
    // ondas) prefere um numero errado a um buraco.
    expect(playerYawDeg(lookingAt(0, 0))).toBe(0);
  });
});

describe("PLAYER_EYE_HEIGHT_M", () => {
  it("cabe na faixa de altura que o gate de RA aceita", () => {
    // O modo tela nao pode simular um jogador que a RA recusaria — se esta
    // altura sair da faixa, o modo tela vira um jogo diferente do de device.
    expect(PLAYER_EYE_HEIGHT_M).toBeGreaterThanOrEqual(MIN_DEVICE_HEIGHT_M);
    expect(PLAYER_EYE_HEIGHT_M).toBeLessThanOrEqual(MAX_DEVICE_HEIGHT_M);
  });
});
