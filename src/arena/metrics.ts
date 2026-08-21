/**
 * Fonte unica de tamanho fisico do jogo, em METROS.
 *
 * A v3 abandonou as "unidades autorais" com fator de conversao global unico
 * (~0,0333, aplicado no root da arena) por um motivo simples: a spec descreve o mundo em
 * metros — torre de 1,20 m, tropa de 0,35 m, fade entre 1,2 m e 0,6 m, raio de
 * arco de 2,2 m. Manter um fator no meio obrigaria a converter de cabeca entre a
 * spec e o codigo em toda leitura. Agora **1 unidade do Babylon = 1 metro**, nos
 * dois modos de renderizacao, e `arenaRoot.scaling` fica em 1.
 *
 * O preco pago: perde-se o comentario de que escala ~0,03 quebra shadow-mapping.
 * Irrelevante aqui — o grounding do projeto e por blob de contato
 * (`src/fx/contactShadow.ts`), nunca por shadow map.
 *
 * Regra de uso: quem constroi um ator deriva o tamanho dele DESTE arquivo, e nao
 * de um numero literal no proprio arquivo. E o que garante que trocar a escala do
 * jogo seja trocar uma constante, e nao caçar dezenas de literais.
 */

/** Altura total da torre-cogumelo. Ela obstrui a visao de proposito (spec §2). */
export const TOWER_HEIGHT_M = 1.2;

/** Altura do Coelho de cartola, orelhas incluidas. */
export const RABBIT_HEIGHT_M = 0.7;

/** Altura de referencia de uma tropa invocada. */
export const TROOP_HEIGHT_M = 0.35;

/** Altura do caldeirao fermentador (Etapa 8; aqui so a constante). */
export const CAULDRON_HEIGHT_M = 0.5;

/**
 * Distancia da camera em que um objeto COMECA a desaparecer.
 *
 * Com objetos de mais de um metro, o jogador encosta neles de verdade. Sem fade,
 * o near plane corta a geometria ao meio e a ilusao morre na hora: aparece o
 * interior oco da malha. O fade resolve isso antes do corte acontecer.
 */
export const FADE_START_M = 1.2;

/** Distancia em que o objeto esta completamente invisivel (alpha 0). */
export const FADE_END_M = 0.6;

/**
 * Alcance de ataque da torre do jogador, em metros (JG-04).
 *
 * Era derivado do diametro do chapeu por um multiplicador (`3.9`) calibrado na
 * arena retangular de 4,4 m, e resultava em ~4,16 m — mais que o DIAMETRO
 * inteiro do arco. Com a torre no vertice, aquele alcance cobria a arena toda e
 * a torre vencia a partida sozinha, sem tropa nenhuma.
 *
 * 1,0 m e a leitura de design, nao de calibragem fina: a torre se defende de
 * quem ja chegou perto, e o anel de fora — de `MIN_PLACE_RADIUS_M` (0,9 m) a
 * `ARENA_RADIUS_M` (2,2 m) — e trabalho da tropa. Numero de tuning: so muda por
 * playtest.
 */
export const TOWER_ATTACK_RANGE_M = 1.0;

/**
 * Quanto uma tropa do jogador se afasta do ponto onde foi colocada para
 * engajar, em metros (JG-04).
 *
 * A spec §4 diz que "a tropa nasce onde foi colocada" e que ONDE colocar e a
 * decisao que o giro do celular paga. Uma tropa que persegue o inimigo pelo
 * arco inteiro apaga essa decisao: qualquer colocacao viraria a mesma coisa
 * alguns segundos depois. Com a coleira, a tropa cobre um pedaco do arco — e
 * cobrir os tres flancos volta a exigir tres colocacoes.
 *
 * Sem alvo dentro da coleira a tropa volta para o ponto de colocacao. Numero de
 * tuning: so muda por playtest.
 */
export const TROOP_LEASH_RADIUS_M = 0.8;
