import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it } from "vitest";

import { PLAYER_EYE_HEIGHT_M, playerYawDeg, type HeadingSource } from "./arenaFraming";
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
  it("chama de 0 a direcao +Z, que e o azimute 0 do arco", () => {
    expect(playerYawDeg(lookingAt(0, 1))).toBe(0);
  });

  it("poe a direcao -Z nas COSTAS do jogador, e nao na frente", () => {
    // O par deste teste com o de cima e o conserto do bug 3 da spec 08. O zero
    // do azimute estava no -Z, convencao de cena DESTRA, enquanto o runtime e
    // canhoto — e como o yaw so era usado em subtracoes, o erro de 180 graus
    // cancelava e ninguem via. Provar o ZERO, e nao so o sinal, e o que impede
    // ele de voltar.
    expect(Math.abs(playerYawDeg(lookingAt(0, -1)))).toBe(180);
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
    expect(sectorOf(playerYawDeg(lookingAt(0, 1)))).toBe("center");
  });

  it("ignora a inclinacao: olhar para o chao nao muda de flanco", () => {
    const lookingDownAndRight: HeadingSource = {
      getDirection: () => new Vector3(0.5, -0.85, 0.1),
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
  it("cabe na faixa de altura que a RA vai oferecer ao jogador", () => {
    // O gate de altura de device morreu com a medicao de piso (spec 08), mas a
    // pergunta que este teste faz continua valendo: o modo tela nao pode
    // simular um jogador impossivel em RA. A faixa agora e a do controle de
    // altura declarada (F3): 1,30 a 2,05 m.
    expect(PLAYER_EYE_HEIGHT_M).toBeGreaterThanOrEqual(1.3);
    expect(PLAYER_EYE_HEIGHT_M).toBeLessThanOrEqual(2.05);
  });
});
