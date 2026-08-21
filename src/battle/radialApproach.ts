/**
 * Navegacao radial: como um inimigo atravessa o arco em direcao ao jogador.
 * Logica pura, sem Babylon.
 *
 * **Por que nao e simplesmente "anda em linha reta ate a torre".** A torre fica
 * no azimute 0 (`PLAYER_TOWER_RADIUS_M`), entao ir direto nela faz um inimigo
 * que nasceu no flanco esquerdo entrar no setor central no meio do caminho — e
 * a seta de flanco, que ja disse "3 na esquerda", passa a mentir sem nada ter
 * acontecido. Foi exatamente o que apareceu na primeira medicao da JG-04: um
 * inimigo nascido em `left` a 2,19 m estava contado em `center` alguns segundos
 * depois.
 *
 * A regra, entao, tem duas fases:
 *
 * 1. **Convergencia radial.** Enquanto esta no anel jogavel, o inimigo mantem o
 *    azimute e so diminui o raio — anda pela propria reta que sai do jogador.
 *    Fica no setor em que nasceu o trajeto inteiro.
 * 2. **Fechamento.** Ao alcancar o anel interno (`closingRadiusM`, que e onde a
 *    torre vive), ele fecha na torre. Aqui trocar de setor nao custa nada: a
 *    ameaca ja chegou, e o jogador esta vendo ou levando dano.
 */

import { toArc, toLocal, type ArenaPoint2D } from "../arena/ArenaArc";

/**
 * Para onde o inimigo deve ANDAR agora. Nao e o alvo do ataque — o alvo
 * continua sendo a torre; isto e so o proximo ponto do caminho.
 */
export function radialApproachDestination(
  from: ArenaPoint2D,
  towerAt: ArenaPoint2D,
  closingRadiusM: number
): ArenaPoint2D {
  const { azimuthDeg, radiusM } = toArc(from);

  if (radiusM <= closingRadiusM) {
    return towerAt;
  }

  return toLocal({ azimuthDeg, radiusM: closingRadiusM });
}
