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

/**
 * Altura de referencia de uma tropa invocada. TODA criatura deriva a propria
 * escala daqui (`UNIT_SCALE = TROOP_HEIGHT_M / AUTHORED_HEIGHT` em cada
 * arquivo), entao este numero e o unico lugar onde o tamanho do elenco muda.
 *
 * **Era 0,35 m e caiu 30% em 2026-08-21**, a pedido do dono do projeto depois de
 * ver em device: "a area visivel da arena e menor do que se imagina". O dado da
 * mesma sessao concorda e explica por que: **76,3% das amostras de distancia da
 * camera estavam dentro do fade** (< 1,2 m), contra 57,7% na sessao anterior. A
 * arena encolheu de 4,4 m para 1,8 m de profundidade e as criaturas nao — um
 * Tatu Bola a um metro e meio passou a ocupar metade do quadro.
 *
 * 0,245 m nao e um numero de calibragem fina; e os 30% pedidos, aplicados. Como
 * tudo aqui, so muda de novo por playtest.
 */
export const TROOP_HEIGHT_M = 0.245;

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
 * Vida do jogador. Ele e o alvo da partida desde a JG-12: nao ha mais torre de
 * combate, e "derrota = a torre cair" (`DJ-5`) virou "derrota = o JOGADOR
 * cair".
 *
 * O numero vem inteiro do `towerCombatSettings.maxHealth` que vivia solto no
 * `main.ts` — mantido igual de proposito, para que a mudanca de alvo nao venha
 * embrulhada numa mudanca de balanceamento. Se a partida ficar facil ou dificil
 * demais depois disto, o culpado e o ritmo das ondas, nao este numero.
 */
export const PLAYER_MAX_HEALTH = 1000;

/**
 * Raio do corpo do jogador, em metros (JG-12).
 *
 * O inimigo para a `contactRange` do proprio corpo MAIS este raio, e so entao
 * bate. Existe porque o jogador nao tem malha: quando o alvo era a torre, a
 * geometria de 1,20 m ocupava o espaco e o inimigo parava naturalmente longe o
 * bastante para ser visto. Convergindo para um alvo sem corpo, ele encostaria na
 * origem — ou seja, ficaria aos pes de quem joga, abaixo do quadro da camera, e
 * o jogador levaria dano de algo que nao consegue ver.
 *
 * 0,55 m e a leitura de design: perto o bastante para ser ameaca, longe o
 * bastante para caber no quadro quando o celular aponta para a frente. Numero de
 * tuning: so muda por playtest.
 */
export const PLAYER_BODY_RADIUS_M = 0.55;

/**
 * Alcance de ataque da Dona Barata (arremesso), em metros.
 *
 * Era derivado — `TOWER_ATTACK_RANGE_M * 0.88` — de um alcance de torre que nao
 * existe mais desde a JG-12. O produto foi resolvido para o numero que ele ja
 * valia, e o alcance dela passou a ser dela. Encadear o alcance de uma tropa no
 * alcance de uma torre morta era o tipo de heranca que sobrevive a refatoracao e
 * mente depois.
 *
 * A torre do jogador tinha 1,0 m de alcance e atacava sozinha quem chegasse
 * perto. Isso saiu por decisao do dono do projeto (2026-08-20): "para que serve
 * colocar as cartas se nao for para me defender". A telemetria concordou — duas
 * partidas seguidas terminaram com 100% e 99,1% de vida, porque a torre resolvia
 * a defesa sozinha. Quem defende e carta; o recurso de emergencia e a fireball.
 */
export const DONA_BARATA_ATTACK_RANGE_M = 0.88;

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

/**
 * Custo da fireball, em cogumelos (JG-12).
 *
 * Ela nao tem cooldown: o teto e o proprio estoque (10 no maximo, um a cada
 * 1,8 s). Quem esvazia o estoque atirando fica sem carta para jogar — e essa e a
 * unica coisa que segura a magia de virar a estrategia principal, por decisao do
 * dono do projeto: "cada tiro e uma carta que voce nao jogou".
 */
export const FIREBALL_COST_MUSHROOMS = 1;

/**
 * Dano da fireball. Fraca de proposito, mas nao decorativa.
 *
 * O numero sai da comparacao com o que ela concorre, e nao de um palpite. A
 * criatura mais barata do baralho e o Javali: custa **2 cogumelos** e tem **200
 * de vida**. Com 50 de dano, derruba-lo a fireball custa **4 cogumelos** — o
 * dobro do preco de simplesmente jogar a carta, que ainda por cima fica em
 * campo e continua lutando. E exatamente essa a relacao que se quer: usar a
 * magia e sempre um mau negocio, e mesmo assim ela salva quando alguem ja
 * chegou perto e nao ha cogumelo para uma carta.
 *
 * A primeira tentativa foi 12 de dano, e o teste headless mostrou o problema na
 * hora: 17 tiros para matar um Javali, com estoque maximo de 10. Isso nao e
 * fraco, e inutil — e um recurso de emergencia que nunca resolve a emergencia
 * nao existe.
 *
 * Efeito colateral desejado: 50 mata uma Dona Barata (35 de vida) num tiro so,
 * entao a fireball tem um uso NITIDO — limpar esquadrao — alem do de apuro.
 *
 * Numero de tuning: so muda por playtest. O sinal de que esta alto demais e
 * simples de ler — se der para vencer uma partida sem colocar carta, ele desce.
 */
export const FIREBALL_DAMAGE = 50;

/**
 * Velocidade do projetil, em metros por segundo.
 *
 * A arena tem 1,8 m de profundidade, entao a 6 m/s o tiro atravessa o campo em
 * ~0,3 s: rapido o bastante para nao parecer preguicoso, devagar o bastante para
 * o olho ver o projetil sair e chegar. Instantaneo (hitscan) seria mais simples,
 * e foi descartado: sem o voo, o jogador nao tem como saber SE acertou — ele
 * so veria o cogumelo sumir.
 */
export const FIREBALL_SPEED_MPS = 6;

/**
 * Tolerancia angular da mira, em graus (ver `src/combat/fireballAim.ts`).
 *
 * Perdoa o tremor da mao em RA sem perdoar apontar para o flanco errado: e
 * menos de um terco do cone de acao (`DEPLOY_CONE_DEG`, 20 graus), entao errar
 * de flanco continua sendo errar.
 */
export const FIREBALL_AIM_CONE_DEG = 6;
