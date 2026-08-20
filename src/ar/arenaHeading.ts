/**
 * A convencao de angulo da arena, isolada em funcoes puras.
 *
 * Este arquivo existe por um motivo especifico: o sinal do yaw alimenta
 * `framedSectors`/`pickSpawnSector` (`src/arena/ArenaArc.ts`), e um sinal
 * trocado nao quebra nada visivelmente — ele so faz o jogo inteiro nascer
 * inimigo na cara do jogador, tres modulos adiante. Matematica que erra assim
 * precisa de teste proprio, e teste proprio precisa dela fora do Babylon.
 *
 * ## A convencao, em uma frase
 *
 * `ArenaArc` mede azimute a partir do **+Z local**, positivo para a **DIREITA**
 * do jogador (frente = +Z, direita = +X, cena **canhota** — o default do
 * Babylon). Este arquivo estende a mesma convencao para o MUNDO: o "heading" de
 * uma direcao horizontal e o azimute dela medido a partir do +Z do mundo,
 * tambem positivo para a direita.
 *
 * Desde a fundacao de RA (spec 08, etapa F2) o `arenaRoot` fica na origem com
 * rotacao identidade PARA SEMPRE — o espaco local da arena E o espaco do mundo.
 * Logo azimute da arena e heading do mundo nao sao so a mesma grandeza em
 * referenciais diferentes: sao o mesmo numero, e nao ha ancora nenhuma a
 * subtrair.
 *
 * ## Por que +Z, e nao -Z
 *
 * Ate a spec 08 este arquivo media a partir do -Z, a convencao de uma cena
 * DESTRA, e mandava ligar `scene.useRightHandedSystem`. As duas coisas estavam
 * erradas:
 *
 * 1. O projeto e CANHOTO e vai continuar sendo. O ramo destro do modulo Babylon
 *    deste build do 8th Wall produz quaternion NaN e mata a pose — nada projeta,
 *    tela preta sobre o feed. Confirmado em device (2026-08-19). Nao ligue essa
 *    flag.
 * 2. No runtime canhoto a frente da camera com `facing` identidade e **+Z**.
 *    Medido: um marcador de azimute 0 colocado em -Z nasce ATRAS do jogador.
 *
 * O SINAL sempre esteve certo (direita da +90 graus nas duas convencoes); o que
 * estava invertido era o ZERO. E como `relativeYawDeg` era uma subtracao de dois
 * headings, o offset de 180 graus CANCELAVA — a selecao de setor parecia certa
 * por acidente enquanto a geometria local do arco nascia de costas. Por isso o
 * teste deste arquivo prova as duas coisas separadamente: o sinal E o zero.
 */

const RAD_TO_DEG = 180 / Math.PI;

/** Normaliza um angulo em graus para o intervalo (-180, +180]. */
export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) {
    return 0;
  }

  let a = deg % 360;

  if (a <= -180) {
    a += 360;
  }

  if (a > 180) {
    a -= 360;
  }

  // `-0` e um valor legal de ponto flutuante, mas polui comparacao e leitura de
  // painel de debug ("-0.0"). Zero e zero.
  return a === 0 ? 0 : a;
}

/**
 * Heading (graus) de uma direcao horizontal do mundo: 0 = +Z, +90 = +X.
 * A componente Y e ignorada de proposito — inclinar o celular para baixo nao
 * pode mudar para que flanco ele aponta.
 *
 * Direcao degenerada (olhando reto para baixo, projecao horizontal nula)
 * devolve 0 em vez de NaN: e um valor arbitrario, mas estavel, e quem consome
 * (a selecao de setor) prefere um numero constante a um buraco.
 */
export function headingDegFromForward(x: number, z: number): number {
  if (Math.abs(x) < 1e-9 && Math.abs(z) < 1e-9) {
    return 0;
  }

  return normalizeAngleDeg(Math.atan2(x, z) * RAD_TO_DEG);
}

/**
 * O `facing` que fixa o azimute 0 do arco no +Z do mundo.
 *
 * E o quaternion identidade, e ele NAO e neutro por acaso: `facing` e a
 * orientacao da origem declarada ao 8th Wall, e qualquer outro valor giraria o
 * mundo inteiro debaixo de uma arena que nao tem rotacao para compensar. Fica
 * aqui, e nao no AR Manager, porque e a mesma convencao que
 * `headingDegFromForward` define — e as duas precisam concordar.
 */
export const ARENA_FACING_FORWARD = { w: 1, x: 0, y: 0, z: 0 } as const;

/** Quaternion como o 8th Wall o troca: `w` primeiro na leitura, `xyz` no resto. */
export interface FacingQuaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Heading do mundo para onde um `facing` aponta — ou seja, que azimute do arco
 * a camera enquadra quando o engine a poe nessa orientacao.
 *
 * Existe para uma coisa so: provar que o `facing` que enviamos ao engine e o
 * azimute que o jogo consome sao a MESMA convencao. Essa concordancia falha em
 * silencio — um `facing` com o sinal trocado nao lanca erro nenhum, so faz o
 * inimigo nascer no flanco errado, e ninguem descobre ate alguem jogar.
 *
 * A conta e a rotacao do vetor `+Z` pelo quaternion, com a componente Y
 * descartada depois, pela mesma razao de `headingDegFromForward`: inclinar o
 * celular nao muda para que flanco ele aponta.
 */
export function headingDegFromFacing(facing: FacingQuaternion): number {
  const { w, x, y, z } = facing;

  if (![w, x, y, z].every((component) => Number.isFinite(component))) {
    return 0;
  }

  const forwardX = 2 * (x * z + w * y);
  const forwardZ = 1 - 2 * (x * x + y * y);

  return headingDegFromForward(forwardX, forwardZ);
}
