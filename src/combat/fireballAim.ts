/**
 * Mira da fireball: dado para onde o celular aponta e onde estao os inimigos,
 * qual deles o tiro acerta. Logica pura, sem Babylon.
 *
 * # Por que existe auto-mira, e por que ela nao e indulgencia
 *
 * O alvo tem 0,35 m de altura e pode estar a 2 m de distancia, e quem mira esta
 * de pe segurando um celular com uma mao, em RA, com o SLAM introduzindo
 * micro-deriva. Sem tolerancia angular o tiro vira sorteio — e um recurso de
 * EMERGENCIA que falha por tremor de mao e pior do que nao existir, porque o
 * jogador paga o cogumelo antes de descobrir que errou.
 *
 * O cone de tolerancia (`FIREBALL_AIM_CONE_DEG`) e estreito de proposito: ele
 * perdoa tremor, nao perdoa apontar para o flanco errado. Mirar continua sendo
 * uma decisao.
 *
 * # A regra de desempate
 *
 * Havendo mais de um inimigo dentro do cone, acerta o de MENOR raio — o mais
 * perto do jogador. E a leitura de design: a fireball existe para responder a
 * quem ja chegou, nao para limpar a fila do fundo. Um desempate por "mais
 * alinhado com a mira" seria defensavel, mas premiaria precisao num gesto que
 * ja e feito sob pressao.
 */

import { normalizeAngleDeg, type ArcPoint } from "../arena/ArenaArc";

/**
 * Indice, dentro de `candidates`, do inimigo que a fireball acerta — ou `null`
 * quando nenhum cai no cone (o tiro voa e apaga sem dano).
 *
 * Recebe indices em vez de unidades para nao arrastar Babylon nem o
 * `CombatEngine` para dentro de logica que e pura trigonometria: quem chama
 * mapeia o indice de volta para a unidade.
 */
export function pickFireballTarget(
  aimAzimuthDeg: number,
  candidates: readonly ArcPoint[],
  coneDeg: number
): number | null {
  const halfCone = coneDeg / 2;

  let bestIndex: number | null = null;
  let bestRadius = Number.POSITIVE_INFINITY;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const offsetFromAim = Math.abs(normalizeAngleDeg(candidate.azimuthDeg - aimAzimuthDeg));

    if (offsetFromAim > halfCone) {
      continue;
    }

    // `>=` e nao `>`: em empate exato de raio, o primeiro da lista ganha. A
    // ordem de `candidates` e a ordem de nascimento, entao o empate resolve de
    // forma estavel e reproduzivel em teste.
    if (candidate.radiusM >= bestRadius) {
      continue;
    }

    bestRadius = candidate.radiusM;
    bestIndex = index;
  }

  return bestIndex;
}
