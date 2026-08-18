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
 * `ArenaArc` mede azimute a partir do **-Z local**, positivo para a **DIREITA**
 * do jogador (frente = -Z, direita = +X, cena **destra**). Este arquivo estende
 * a mesma convencao para o MUNDO: o "heading" de uma direcao horizontal e o
 * azimute dela medido a partir do -Z do mundo, tambem positivo para a direita.
 *
 * Com isso, azimute da arena e heading do mundo sao a MESMA grandeza em
 * referenciais diferentes, e a conversao entre eles e uma subtracao:
 *
 *     azimuteDaArena = heading(direcao) - heading(direcao no fechamento)
 *
 * ## Por que a cena precisa ser destra
 *
 * "Direita do jogador" e `cross(frente, cima)` numa cena destra e
 * `cross(cima, frente)` numa canhota — os dois dao lados OPOSTOS. Ou seja: a
 * convencao acima so e coerente com `scene.useRightHandedSystem = true`. O
 * modulo Babylon do 8th Wall liga isso sozinho na sessao de RA; `src/main.ts`
 * liga na criacao da cena para que o modo tela nao seja o espelho do modo RA.
 */

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

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
 * Heading (graus) de uma direcao horizontal do mundo: 0 = -Z, +90 = +X.
 * A componente Y e ignorada de proposito — inclinar o celular para baixo nao
 * pode mudar para que flanco ele aponta.
 *
 * Direcao degenerada (olhando reto para baixo, projecao horizontal nula)
 * devolve 0 em vez de NaN: e um valor arbitrario, mas estavel, e quem consome
 * (o preview do arco) prefere um numero constante a um buraco.
 */
export function headingDegFromForward(x: number, z: number): number {
  if (Math.abs(x) < 1e-9 && Math.abs(z) < 1e-9) {
    return 0;
  }

  return normalizeAngleDeg(Math.atan2(x, -z) * RAD_TO_DEG);
}

/**
 * Yaw da camera EM RELACAO ao azimute 0 da arena — o insumo de
 * `framedSectors`/`pickSpawnSector`. Positivo = o celular girou para a direita
 * do jogador em relacao a como ele estava no fechamento.
 */
export function relativeYawDeg(headingDeg: number, anchorHeadingDeg: number): number {
  return normalizeAngleDeg(headingDeg - anchorHeadingDeg);
}

/**
 * Yaw (RADIANOS, Euler em Y do Babylon) que o `arenaRoot` precisa para que o
 * -Z LOCAL dele — o azimute 0 do `ArenaArc` — aponte para o heading informado.
 *
 * `Matrix.RotationY(t)` leva `(x, z)` para `(x·cos t + z·sin t, -x·sin t + z·cos t)`.
 * Aplicando em `(0, -1)` (o -Z local) e igualando ao vetor do heading
 * `(sin h, -cos h)` sai `t = -h`. Ou seja: o yaw do root e o NEGATIVO do
 * heading, e nao o heading — errar isso espelha a arena inteira.
 */
export function arenaRootYawRad(headingDeg: number): number {
  return -headingDeg * DEG_TO_RAD;
}

/** Vetor horizontal unitario de um heading. Inverso de `headingDegFromForward`. */
export function forwardFromHeadingDeg(headingDeg: number): { x: number; z: number } {
  const rad = headingDeg * DEG_TO_RAD;

  return { x: Math.sin(rad), z: -Math.cos(rad) };
}

/**
 * Leva um ponto do espaco LOCAL da arena (o mesmo de `ArenaArc.toLocal`) para
 * deslocamento de mundo, dado o heading do fechamento. E a mesma rotacao que
 * `arenaRootYawRad` produz, escrita em numeros puros para o teste poder provar
 * que as duas concordam — e que azimute positivo cai mesmo na direita do
 * jogador, seja qual for o heading.
 */
export function arenaLocalToWorldOffset(
  headingDeg: number,
  localX: number,
  localZ: number
): { x: number; z: number } {
  const t = arenaRootYawRad(headingDeg);
  const c = Math.cos(t);
  const s = Math.sin(t);

  return { x: localX * c + localZ * s, z: -localX * s + localZ * c };
}
