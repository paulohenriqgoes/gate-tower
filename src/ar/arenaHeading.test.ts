import { describe, expect, it } from "vitest";

import {
  ARENA_FACING_FORWARD,
  headingDegFromFacing,
  headingDegFromForward,
  normalizeAngleDeg,
} from "./arenaHeading";
import { sectorOf, toArc, toLocal } from "../arena/ArenaArc";

/**
 * Este arquivo prova DUAS coisas separadas sobre o azimute, e a separacao e o
 * ponto.
 *
 * O SINAL — direita do jogador da angulo positivo — sempre esteve certo, e
 * continuaria certo mesmo com a convencao invertida: `atan2(x, -z)` e
 * `atan2(x, z)` concordam sobre qual lado e a direita.
 *
 * O ZERO nao. Ate a spec 08 ele ficava no -Z (convencao de cena DESTRA), e o
 * runtime e canhoto: a frente da camera com `facing` identidade e o +Z, e um
 * marcador de azimute 0 colocado em -Z nasce ATRAS do jogador (confirmado em
 * device, 2026-08-19).
 *
 * O erro sobreviveu tanto tempo porque o yaw so era consumido em SUBTRACOES
 * (`heading - headingDaAncora`), e ali o offset de 180 graus cancela. O que nao
 * cancelava era a geometria local do arco. Um teste que so verifica o sinal
 * passa nas duas convencoes e nao protege nada — por isso cada bloco abaixo diz
 * qual das duas propriedades esta provando.
 */
const AZIMUTHS = [-180, -135, -90, -45, -12, 0, 30, 60, 90, 135, 179];

describe("normalizeAngleDeg", () => {
  it("mantem angulos ja dentro de (-180, 180]", () => {
    for (const deg of AZIMUTHS) {
      expect(normalizeAngleDeg(deg)).toBeCloseTo(deg === -180 ? 180 : deg);
    }
  });

  it("dobra angulos fora da faixa", () => {
    expect(normalizeAngleDeg(190)).toBeCloseTo(-170);
    expect(normalizeAngleDeg(-190)).toBeCloseTo(170);
    expect(normalizeAngleDeg(540)).toBeCloseTo(180);
  });

  it("nunca devolve -0 nem NaN", () => {
    expect(Object.is(normalizeAngleDeg(-0), 0)).toBe(true);
    expect(normalizeAngleDeg(Number.NaN)).toBe(0);
    expect(normalizeAngleDeg(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("headingDegFromForward — o ZERO", () => {
  it("chama de 0 a direcao +Z", () => {
    expect(headingDegFromForward(0, 1)).toBe(0);
  });

  it("poe o -Z nas COSTAS do jogador, a 180 graus", () => {
    // O teste que teria pego o bug 3 da spec 08. Sem ele, `atan2(x, -z)` passa
    // por todos os outros testes deste arquivo.
    expect(Math.abs(headingDegFromForward(0, -1))).toBe(180);
  });

  it("concorda com o zero do `ArenaArc`: azimute 0 cai no +Z local", () => {
    // Amarra as duas convencoes uma na outra. Elas TEM que ser a mesma, porque
    // desde a F2 o espaco local da arena E o espaco do mundo — `arenaRoot` fica
    // na origem, sem rotacao, para sempre.
    const local = toLocal({ azimuthDeg: 0, radiusM: 2.2 });

    expect(local.x).toBeCloseTo(0);
    expect(local.z).toBeCloseTo(2.2);
    expect(headingDegFromForward(local.x, local.z)).toBeCloseTo(0);
  });
});

describe("headingDegFromForward — o SINAL", () => {
  it("da heading POSITIVO para a direita do jogador (+X)", () => {
    // Um sinal trocado aqui nao quebra nada visivelmente: so faz o inimigo
    // nascer no flanco que o jogador esta encarando, tres modulos adiante.
    expect(headingDegFromForward(1, 0)).toBeCloseTo(90);
    expect(headingDegFromForward(-1, 0)).toBeCloseTo(-90);
  });

  it("nao depende do comprimento do vetor", () => {
    expect(headingDegFromForward(3, 3)).toBeCloseTo(headingDegFromForward(0.1, 0.1));
  });

  it("devolve 0 (e nao NaN) para direcao horizontal degenerada", () => {
    expect(headingDegFromForward(0, 0)).toBe(0);
  });
});

describe("heading do mundo e azimute da arena sao o MESMO numero", () => {
  /**
   * A consequencia direta da fundacao de RA: sem `arenaRoot` transladado ou
   * rotacionado, nao existe conversao entre "para onde o jogador olha" e "que
   * azimute do arco e esse". A versao anterior tinha `relativeYawDeg`,
   * `arenaRootYawRad` e `arenaLocalToWorldOffset` para fazer essa ponte — as
   * tres sumiram porque a ponte nao liga mais dois lugares diferentes.
   */
  it("um ponto do arco tem heading igual ao proprio azimute", () => {
    for (const azimuthDeg of AZIMUTHS) {
      const local = toLocal({ azimuthDeg, radiusM: 2.2 });

      // `normalizeAngleDeg` fecha a faixa em (-180, +180], entao -180 volta
      // como +180; `toArc` devolve o `atan2` cru. E a mesma direcao — comparar
      // sem cuidar do wrap so faria o teste reclamar de aritmetica de angulo.
      const expected = azimuthDeg === -180 ? 180 : azimuthDeg;

      expect(headingDegFromForward(local.x, local.z)).toBeCloseTo(expected);
      expect(normalizeAngleDeg(toArc(local).azimuthDeg)).toBeCloseTo(expected);
    }
  });

  it("olhar para a direita seleciona o setor da direita", () => {
    // As direcoes sao os CENTROS dos flancos (+-20 graus), e nao +-90: desde
    // 2026-08-21 a arena e o proprio FOV de 60 graus, entao um olhar a 90 cai
    // fora dela. O que o teste prova continua sendo o sinal — virar para o +X
    // do jogador tem de dar o flanco da direita.
    const right = { x: Math.sin((20 * Math.PI) / 180), z: Math.cos((20 * Math.PI) / 180) };

    expect(sectorOf(headingDegFromForward(right.x, right.z))).toBe("right");
    expect(sectorOf(headingDegFromForward(-right.x, right.z))).toBe("left");
    expect(sectorOf(headingDegFromForward(0, 1))).toBe("center");
  });

  it("olhar para os lados, alem da arena, nao seleciona setor nenhum", () => {
    expect(sectorOf(headingDegFromForward(1, 0))).toBeNull();
    expect(sectorOf(headingDegFromForward(-1, 0))).toBeNull();
  });

  it("olhar para tras nao seleciona setor nenhum", () => {
    // `DR-1`: nada induz o jogador a girar para fora da arena. Tudo o que nao e
    // o campo a frente e terra de ninguem — e precisa ser reportado como
    // `null`, e nao como o setor mais proximo.
    expect(sectorOf(headingDegFromForward(0, -1))).toBeNull();
  });
});

/**
 * O `facing` declarado ao engine e o azimute que o jogo consome precisam ser a
 * MESMA convencao, e essa concordancia e a que falha calada: um sinal trocado
 * aqui nao lanca erro, so faz o inimigo nascer no flanco errado.
 *
 * A RA-F4 torna isso vivo. Ate ela, o `facing` era identidade e nunca mudava;
 * com `recenter()` o jogador volta a escolher para onde o arco olha, e o
 * caminho passa a ter um quaternion de verdade dentro. Por isso o zero e o
 * sinal sao provados separados, como na RA-F2.
 */
describe("headingDegFromFacing — o ZERO", () => {
  it("o facing identidade olha para o azimute 0 do arco", () => {
    // Este e o contrato inteiro da arena na origem: `facing` identidade fixa o
    // azimute 0 no +Z do mundo. Se este numero deixar de ser 0, a arena passa a
    // nascer girada em relacao ao que o jogador enquadrou.
    expect(headingDegFromFacing(ARENA_FACING_FORWARD)).toBe(0);
  });

  it("concorda com o +Z lido como direcao de olhar", () => {
    expect(headingDegFromFacing(ARENA_FACING_FORWARD)).toBe(headingDegFromForward(0, 1));
  });
});

describe("headingDegFromFacing — o SINAL", () => {
  /** Quaternion de yaw puro, em graus, na convencao canhota da cena. */
  const yawFacing = (deg: number) => {
    const half = (deg * Math.PI) / 360;

    return { w: Math.cos(half), x: 0, y: Math.sin(half), z: 0 };
  };

  it("yaw positivo aponta para a DIREITA do jogador", () => {
    expect(headingDegFromFacing(yawFacing(90))).toBeCloseTo(90, 6);
  });

  it("yaw negativo aponta para a ESQUERDA do jogador", () => {
    expect(headingDegFromFacing(yawFacing(-90))).toBeCloseTo(-90, 6);
  });

  it("meia volta cai na borda normalizada, e nao em -180", () => {
    expect(headingDegFromFacing(yawFacing(180))).toBeCloseTo(180, 6);
  });

  it("quaternion com componente nao-finita devolve 0 em vez de contaminar o setor", () => {
    // Mesma politica de `normalizeAngleDeg`: quem consome isto e a selecao de
    // setor, e ela prefere um numero constante a um NaN que se espalha.
    expect(headingDegFromFacing({ w: Number.NaN, x: 0, y: 0, z: 0 })).toBe(0);
  });
});
