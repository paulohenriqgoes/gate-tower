/**
 * Navegacao radial: como um inimigo atravessa o arco em direcao ao jogador.
 * Logica pura, sem Babylon.
 *
 * **Por que a regra existe, e por que ela ficou barata.** Enquanto o alvo era a
 * torre do jogador — que ficava a 0,9 m no azimute 0, e nao na origem — ir
 * direto nela fazia um inimigo nascido no flanco esquerdo entrar no setor
 * central no meio do caminho, e a seta de flanco, que ja tinha dito "3 na
 * esquerda", passava a mentir sem nada ter acontecido. Foi exatamente o que
 * apareceu na primeira medicao da JG-04: um inimigo nascido em `left` a 2,19 m
 * estava contado em `center` alguns segundos depois.
 *
 * Desde a JG-12 o alvo e o proprio JOGADOR, que E a origem do arco — entao a
 * reta ate o alvo ja E a reta radial, e o defeito nao tem mais como acontecer.
 * A regra continua aqui, com o mesmo teste, por dois motivos: ela e o que
 * PROVA a propriedade ("nao troca de setor no caminho") em vez de deixa-la
 * depender de o alvo estar na origem, e ela volta a fazer trabalho de verdade
 * no dia em que existir um alvo fora do vertice — o caldeirao da JG-08, por
 * exemplo.
 *
 * A regra tem duas fases:
 *
 * 1. **Convergencia radial.** Enquanto esta no anel jogavel, o inimigo mantem o
 *    azimute e so diminui o raio — anda pela propria reta que sai do jogador.
 *    Fica no setor em que nasceu o trajeto inteiro.
 * 2. **Fechamento.** Ao alcancar o anel interno (`closingRadiusM`), ele fecha no
 *    alvo. Aqui trocar de setor nao custa nada: a ameaca ja chegou, e o jogador
 *    esta vendo ou levando dano.
 */

import { toArc, toLocal, type ArenaPoint2D } from "../arena/ArenaArc";

/**
 * Para onde o inimigo deve ANDAR agora. Nao e o alvo do ataque — isto e so o
 * proximo ponto do caminho.
 */
export function radialApproachDestination(
  from: ArenaPoint2D,
  targetAt: ArenaPoint2D,
  closingRadiusM: number
): ArenaPoint2D {
  const { azimuthDeg, radiusM } = toArc(from);

  if (radiusM <= closingRadiusM) {
    return targetAt;
  }

  return toLocal({ azimuthDeg, radiusM: closingRadiusM });
}
