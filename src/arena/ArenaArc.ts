/**
 * Modelo da arena: onde as coisas estao, o que o jogador VE e onde ele consegue
 * AGIR. Logica pura, sem Babylon e sem cena.
 *
 * # A virada de 2026-08-21: o recurso escasso deixou de ser ver
 *
 * A v3 nasceu com um arco de 180 graus e a tese de que "atencao e o recurso
 * escasso": o FOV de 60 graus cobria exatamente um flanco de tres, e os outros
 * dois ficavam cegos. Isso funcionava por uma coincidencia geometrica — o arco
 * era 3x o FOV — e so por causa dela.
 *
 * Quando o dono do projeto pediu para encolher o arco para 90 graus (girar ate
 * +-90 e desconfortavel, e em ambiente pequeno o drift piora), a coincidencia
 * quebrou: com flancos de 30 graus, um FOV de 60 cobre os TRES ao mesmo tempo, e
 * nao sobra esconderijo nenhum para o inimigo nascer. Medido: com arco de 90, em
 * 33% dos angulos possiveis nao existe um unico flanco cego.
 *
 * A saida nao foi devolver o arco, foi **trocar o recurso**:
 *
 * - **Ver e de graca.** A arena inteira cabe no quadro. O jogador enxerga os
 *   tres flancos sendo atacados ao mesmo tempo, e isso e proposital — nao ha
 *   informacao escondida.
 * - **Agir e caro.** So da para colocar carta (e mirar a fireball) dentro de um
 *   cone estreito, `DEPLOY_CONE_DEG`, centrado em para onde o celular aponta.
 *   Sao precisas tres posicoes de mira para cobrir a arena.
 *
 * A tensao vira "vejo tres incendios e so consigo apagar um por vez", que e uma
 * pergunta melhor do que "o que esta acontecendo atras de mim" — e sobrevive a
 * qualquer tamanho de arena, porque nao depende de o FOV ter a largura exata de
 * um flanco.
 *
 * # A forma
 *
 * A arena e um RETANGULO a frente do jogador, dimensionado para caber inteiro no
 * FOV: `ARENA_WIDTH_M` x `ARENA_DEPTH_M`. Os flancos continuam sendo divisoes
 * ANGULARES (o azimute e o que o giro do celular muda), e por isso o par
 * azimute/raio continua sendo a linguagem do modelo.
 *
 * Ver spec v3 §1, §2, §4 e `docs/specs-arena-180/decisoes.md` (`DJ-9`).
 */

/** FOV util do device em retrato (varia por aparelho, este e o valor de referencia). */
export const DEVICE_FOV_DEG = 60;

/**
 * Profundidade da arena, em metros: do jogador ate o fundo.
 *
 * Era um RAIO de 2,2 m. Caiu para 1,8 m pela telemetria de 2026-08-21: em 21
 * colocacoes medidas numa sessao de device, o raio MAIOR que o jogador usou foi
 * 1,88 m e a mediana foi 1,12 m. Os 2,2 m nunca existiram na pratica — o que
 * existia era arena atravessando parede.
 */
export const ARENA_DEPTH_M = 1.8;

/**
 * Largura da arena, em metros — DERIVADA, nunca digitada.
 *
 * E exatamente a largura que o FOV cobre na profundidade do fundo, e e isso que
 * garante a propriedade de design que o dono do projeto pediu: "ele ve tudo, nao
 * tem problema". Os cantos do fundo caem em +-`DEVICE_FOV_DEG / 2` de azimute,
 * ou seja, na borda exata do quadro. Digitar 2,1 aqui deixaria os cantos um
 * triz fora do FOV, e o jogador perderia justamente o pedaco da arena onde nao
 * consegue agir sem girar.
 */
export const ARENA_WIDTH_M = 2 * ARENA_DEPTH_M * Math.tan((DEVICE_FOV_DEG / 2) * (Math.PI / 180));

/**
 * O arco de referencia que divide a arena em flancos. Igual ao FOV de
 * proposito: os cantos do fundo estao na borda do quadro, entao TODO ponto da
 * arena cai dentro deste arco.
 *
 * Era 180 (`DJ-7`), passou por 90, e parou em 60 quando o recurso escasso deixou
 * de ser a visao — ver o docblock do modulo. Os tres flancos agora sao tres
 * ZONAS DE ACAO de 20 graus, e nao tres pedacos de mundo escondidos.
 */
export const ARENA_ARC_DEG = DEVICE_FOV_DEG;
/** Numero de setores (flancos) em que o arco e dividido. */
export const ARENA_SECTOR_COUNT = 3;

/**
 * O cone em que o jogador consegue AGIR: colocar carta e mirar a fireball. E o
 * recurso escasso do jogo (`DJ-9`, 2026-08-21).
 *
 * Igual a largura de UM flanco (`ARENA_ARC_DEG / ARENA_SECTOR_COUNT`), e nao por
 * coincidencia: e o que faz cobrir a arena custar exatamente tres posicoes de
 * mira, mantendo "onde colocar" como a decisao que o giro do celular paga.
 *
 * Ele e um CONE, entao alcanca pouco perto do jogador e muito longe dele: 0,35 m
 * de largura a 1,0 m de distancia, 0,63 m a 1,8 m. Foi assim que o dono do
 * projeto o descreveu antes de existir — "um cone que vai ficando bem largo
 * quanto mais longe do player".
 */
export const DEPLOY_CONE_DEG = ARENA_ARC_DEG / ARENA_SECTOR_COUNT;

/**
 * Distancia minima do jogador, em metros — sem ela o jogador otimo empilha tudo
 * em cima de si mesmo, e a tropa nasceria dentro da camera.
 *
 * Era 0,9 m, e esse numero nao era sobre colocacao: ele era igual a
 * `PLAYER_TOWER_RADIUS_M` de proposito, para a torre do jogador ocupar
 * exatamente a borda interna do anel e nenhuma colocacao legal cair em cima
 * dela. **A JG-12 removeu a torre, e o motivo evaporou junto.**
 *
 * Caiu para 0,5 m porque a sessao de device de 2026-08-21 mostrou o custo dele:
 * 25 colocacoes recusadas contra 21 aceitas — 54% de recusa, com rajadas de seis
 * recusas seguidas em 13 segundos.
 */
export const MIN_PLACE_RADIUS_M = 0.5;

export type SectorId = "left" | "center" | "right";

/** Ponto 2D no espaco local da arena (y = 0 sempre). */
export interface ArenaPoint2D {
  x: number;
  z: number;
}

/**
 * Azimute em graus. 0 = a direcao para onde o jogador aponta no fechamento.
 * Positivo cresce para a DIREITA do jogador. Frente = +Z, direita = +X (cena
 * CANHOTA, o default do Babylon e o unico caminho que este build do 8th Wall
 * suporta — ver `src/ar/arenaHeading.ts`).
 *
 * Desde a spec 08 (F2) o `arenaRoot` fica na origem com rotacao identidade para
 * sempre: este espaco local E o espaco do mundo, e o azimute 0 e literalmente o
 * +Z do mundo — a direcao em que a camera de RA olha com `facing` identidade.
 */
export interface ArcPoint {
  azimuthDeg: number;
  radiusM: number;
}

export type PlacementVerdict =
  | { ok: true }
  | { ok: false; reason: "fora-da-arena" | "perto-demais" };

/**
 * Veredito de COLOCACAO, que e mais estrito que o de arena: alem de estar dentro
 * do campo, o ponto precisa cair no cone de acao. `fora-do-cone` e a recusa nova
 * e a mais comum — ela e o proprio recurso escasso do jogo, nao um defeito.
 */
export type DeployRefusalReason = "fora-da-arena" | "perto-demais" | "fora-do-cone";

export type DeployVerdict = { ok: true } | { ok: false; reason: DeployRefusalReason };

/**
 * A razao da recusa, ou `null` quando o veredito aprova.
 *
 * Existe porque o projeto compila com `strict: false` (ver `tsconfig.json`), e
 * sem `strictNullChecks` o TypeScript nao estreita uniao discriminada por
 * `if (!verdict.ok)` — ler `verdict.reason` la dentro nao compila. O cast fica
 * aqui, uma vez, com o motivo escrito, em vez de espalhado por cada chamador.
 */
export function refusalReason(verdict: DeployVerdict): DeployRefusalReason | null {
  return verdict.ok ? null : (verdict as { ok: false; reason: DeployRefusalReason }).reason;
}

// Setores em ordem left -> right por azimute crescente. Fixa em 3 elementos
// porque SectorId e uma uniao fechada de 3 valores; ARENA_SECTOR_COUNT existe
// para deixar a formula de largura explicita (arcDeg / sectorCount), nao para
// permitir outra contagem de setores hoje.
const SECTOR_IDS: readonly SectorId[] = ["left", "center", "right"];

// Tolerancia de ponto flutuante para comparacoes de fronteira. So importa
// quando o azimute vem de trigonometria (toArc); azimutes literais nos testes
// nao dependem dela.
const EPS = 1e-9;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Normaliza um angulo em graus para o intervalo (-180, +180].
 *
 * Exportada porque quem mede DIFERENCA de angulo precisa dela para nao ser
 * mordido pelo wrap — a mira da fireball (`fireballAim.ts`) e o caso vivo.
 */
export function normalizeAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}

/**
 * Indice do setor (0 = left ... sectorCount-1 = right) para um azimute, dado
 * um arco e uma contagem de setores explicitos.
 *
 * Convencao de fronteira: os setores particionam [-arcDeg/2, +arcDeg/2] em
 * intervalos semiabertos `[inicio, fim)`, EXCETO o ultimo (mais a direita),
 * que fecha nas duas pontas — assim o extremo superior do arco cai dentro de
 * um setor em vez de sobrar de fora, sem nenhuma fronteira pertencer a dois
 * setores ao mesmo tempo. Com o arco padrao (180, 3 setores de 60): left =
 * [-90, -30), center = [-30, 30), right = [30, 90].
 *
 * Recebe `arcDeg`/`sectorCount` como parametros explicitos (em vez de ler as
 * constantes publicas direto) para que os testes possam provar que a mesma
 * matematica funciona com outro arco (ex.: 120) sem duplicar logica.
 */
function sectorIndexOf(azimuthDeg: number, arcDeg: number, sectorCount: number): number | null {
  const half = arcDeg / 2;
  if (azimuthDeg < -half - EPS || azimuthDeg > half + EPS) {
    return null;
  }
  const width = arcDeg / sectorCount;
  const rawIndex = Math.floor((azimuthDeg + half) / width);
  return Math.min(sectorCount - 1, Math.max(0, rawIndex));
}

/**
 * Setor de um azimute (graus). `null` quando o azimute cai fora do arco.
 * `arcDeg`/`sectorCount` sao parametros opcionais so para teste — o codigo de
 * produto sempre chama com um argumento so e usa as constantes publicas.
 */
export function sectorOf(
  azimuthDeg: number,
  arcDeg: number = ARENA_ARC_DEG,
  sectorCount: number = ARENA_SECTOR_COUNT
): SectorId | null {
  const idx = sectorIndexOf(azimuthDeg, arcDeg, sectorCount);
  return idx === null ? null : SECTOR_IDS[idx];
}

/**
 * Faixa `[inicio, fim]` em graus de um setor. Os valores sao os limites
 * numericos exatos — a inclusividade de cada ponta segue a convencao descrita
 * em `sectorIndexOf`. `arcDeg`/`sectorCount` sao opcionais so para teste.
 */
export function sectorRangeDeg(
  sector: SectorId,
  arcDeg: number = ARENA_ARC_DEG,
  sectorCount: number = ARENA_SECTOR_COUNT
): [number, number] {
  const idx = SECTOR_IDS.indexOf(sector);
  const half = arcDeg / 2;
  const width = arcDeg / sectorCount;
  const start = -half + idx * width;
  const end = start + width;
  return [start, end];
}

/** Azimute central de um setor, em graus. `arcDeg`/`sectorCount` opcionais so para teste. */
export function sectorCenterDeg(
  sector: SectorId,
  arcDeg: number = ARENA_ARC_DEG,
  sectorCount: number = ARENA_SECTOR_COUNT
): number {
  const [start, end] = sectorRangeDeg(sector, arcDeg, sectorCount);
  return (start + end) / 2;
}

/**
 * Converte um ponto local (metros, y implicito 0) para o par polar
 * azimute/raio. Inverso exato de `toLocal` (dentro de tolerancia de ponto
 * flutuante). Com raio 0 o azimute nao tem significado geometrico; a formula
 * devolve 0 nesse caso (atan2(0,0) = 0), o que e um valor arbitrario mas
 * estavel.
 */
export function toArc(p: ArenaPoint2D): ArcPoint {
  const radiusM = Math.sqrt(p.x * p.x + p.z * p.z);
  // `atan2(x, z)`, e nao `atan2(x, -z)`: o zero do azimute e o +Z. O sinal e o
  // mesmo nas duas convencoes (direita da +90), so o zero e que muda — e o zero
  // e justamente o que nao cancela em medida relativa.
  const azimuthDeg = radToDeg(Math.atan2(p.x, p.z));
  return { azimuthDeg, radiusM };
}

/** Converte um ponto polar (azimute/raio) para o espaco local (metros, y implicito 0). Inverso exato de `toArc`. */
export function toLocal(p: ArcPoint): ArenaPoint2D {
  const rad = degToRad(p.azimuthDeg);
  return {
    x: p.radiusM * Math.sin(rad),
    z: p.radiusM * Math.cos(rad)
  };
}

/**
 * O raio da BORDA da arena num dado azimute, em metros.
 *
 * A arena e retangular, entao a borda nao esta a uma distancia constante: no
 * azimute 0 o fundo esta a `ARENA_DEPTH_M`, e nos cantos (+-30 graus) esta a
 * 2,08 m. Quem faz inimigo nascer "na borda" precisa deste numero, e nao de um
 * raio fixo — com um raio fixo, um nascimento no flanco cairia dentro do campo e
 * um nascimento no centro cairia fora dele.
 *
 * Fora do arco o conceito nao existe, e a funcao devolve 0: quem chama ja
 * validou o azimute (o `WaveDirector` sorteia entre setores, e todo setor esta
 * dentro do arco por construcao).
 */
export function arenaEdgeRadiusAt(azimuthDeg: number): number {
  if (sectorOf(azimuthDeg) === null) {
    return 0;
  }

  return ARENA_DEPTH_M / Math.cos(degToRad(azimuthDeg));
}

/**
 * O ponto esta DENTRO da arena? Geometria pura do campo — o retangulo mais a
 * folga minima em volta do jogador. Nao diz nada sobre o jogador conseguir agir
 * ali; para isso e `evaluateDeployment`.
 *
 * Quem usa esta versao e o nascimento de INIMIGO: ele pode nascer em qualquer
 * canto do campo, inclusive num que o jogador nao alcanca sem girar — alias, e
 * exatamente esse o ponto.
 *
 * Ordem de recusa, deterministica: fora da arena vem antes de perto demais.
 */
export function evaluatePlacement(p: ArcPoint): PlacementVerdict {
  const { x, z } = toLocal(p);

  // O campo e a INTERSECAO do retangulo com o arco de flancos, e nao o
  // retangulo cru. Os dois nao coincidem: perto do jogador o retangulo se
  // estende para os lados muito alem de +-30 graus (no limite, ate 90), e um
  // ponto ali nao pertence a flanco nenhum.
  //
  // O device de 2026-08-21 mostrou o custo de esquecer isso: quatro colocacoes
  // foram ACEITAS em azimutes de 59,9, 61,4, 30,7 e 30,9 graus. Uma tropa la
  // fica fora de `sectorOf`, some da contagem de `getSectorThreats` e nao e
  // coberta por mira nenhuma — um pedaco de campo jogavel que a mecanica de
  // flancos nao enxerga.
  if (sectorOf(p.azimuthDeg) === null) {
    return { ok: false, reason: "fora-da-arena" };
  }

  if (Math.abs(x) > ARENA_WIDTH_M / 2 + EPS || z > ARENA_DEPTH_M + EPS || z < -EPS) {
    return { ok: false, reason: "fora-da-arena" };
  }
  if (p.radiusM < MIN_PLACE_RADIUS_M) {
    return { ok: false, reason: "perto-demais" };
  }
  return { ok: true };
}

/**
 * O jogador consegue colocar uma carta neste ponto, apontando o celular para
 * `cameraYawDeg`?
 *
 * E `evaluatePlacement` mais o **cone de acao**: o ponto tem de estar dentro de
 * `DEPLOY_CONE_DEG` centrado na mira. Este cone e o recurso escasso do jogo
 * (`DJ-9`) — ver o azimute inteiro e de graca, agir nele nao e.
 *
 * A recusa por cone vem POR ULTIMO de proposito. As outras duas sao erro de
 * mira ("voce apontou para fora do campo"); esta e uma regra do jogo ("voce
 * precisa virar para la"), e a UI da JG-06 responde a elas de formas
 * diferentes: as duas primeiras nao desenham anel nenhum, e a terceira desenha
 * o anel em cinza, dizendo onde ele ficaria se voce girasse.
 */
export function evaluateDeployment(p: ArcPoint, cameraYawDeg: number): DeployVerdict {
  const placement = evaluatePlacement(p);

  if (!placement.ok) {
    return placement;
  }

  const offsetFromAim = Math.abs(normalizeAngleDeg(p.azimuthDeg - cameraYawDeg));

  if (offsetFromAim > DEPLOY_CONE_DEG / 2 + EPS) {
    return { ok: false, reason: "fora-do-cone" };
  }

  return { ok: true };
}

/** Comprimento da intersecao entre dois intervalos fechados. Negativo/zero quando nao ha sobreposicao com area. */
function intervalOverlapLength(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.min(aMax, bMax) - Math.max(aMin, bMin);
}

/**
 * O cone `[yawDeg - fovDeg/2, yawDeg + fovDeg/2]` cobre o setor `[sectorStart,
 * sectorEnd]` com area positiva? Um toque de fronteira (sobreposicao de
 * comprimento zero) nao conta como enquadrado — senao um FOV exatamente do
 * tamanho de um setor "enquadraria" os dois vizinhos so por encostar neles.
 *
 * Testa tres copias deslocadas (-360, 0, +360) do cone para cobrir o wrap de
 * angulo sem precisar recortar o intervalo manualmente.
 */
function coneOverlapsSector(yawDeg: number, fovDeg: number, sectorStart: number, sectorEnd: number): boolean {
  const half = fovDeg / 2;
  const coneMin = yawDeg - half;
  const coneMax = yawDeg + half;
  for (const shift of [-360, 0, 360]) {
    if (intervalOverlapLength(coneMin + shift, coneMax + shift, sectorStart, sectorEnd) > EPS) {
      return true;
    }
  }
  return false;
}

/**
 * Setores que o celular cobre agora. Vazio quando o jogador olha para fora do
 * arco.
 *
 * Com o `fovDeg` default isto responde "o que eu VEJO" — e desde 2026-08-21 a
 * resposta e quase sempre "a arena toda", de proposito. Para "onde eu consigo
 * AGIR", que e a pergunta cara, use `reachableSectors`.
 */
export function framedSectors(cameraYawDeg: number, fovDeg: number = DEVICE_FOV_DEG): SectorId[] {
  const yaw = normalizeAngleDeg(cameraYawDeg);
  const result: SectorId[] = [];
  for (const sector of SECTOR_IDS) {
    const [start, end] = sectorRangeDeg(sector);
    if (coneOverlapsSector(yaw, fovDeg, start, end)) {
      result.push(sector);
    }
  }
  return result;
}

/**
 * Setores que o jogador ALCANCA agora — aqueles em que ele conseguiria colocar
 * uma carta sem girar o celular. E `framedSectors` medido com o cone de acao em
 * vez do FOV.
 *
 * Com `DEPLOY_CONE_DEG` valendo exatamente a largura de um flanco, a resposta e
 * um setor na maior parte dos angulos, e dois quando a mira cai em cima de uma
 * fronteira. Nunca os tres — e essa a garantia que sustenta o jogo: sempre
 * existe pelo menos um flanco que voce ve e nao alcanca.
 */
export function reachableSectors(cameraYawDeg: number): SectorId[] {
  return framedSectors(cameraYawDeg, DEPLOY_CONE_DEG);
}

/**
 * Setor de spawn. NUNCA um setor que o jogador ALCANCE, salvo no caso
 * degenerado em que todos estejam alcancaveis — ai sorteia entre todos em vez de
 * travar sem opcao.
 *
 * **O criterio mudou em 2026-08-21**: era "nunca um setor ENQUADRADO". Enquanto
 * o arco tinha 180 graus e o FOV cobria exatamente um flanco, as duas coisas
 * davam no mesmo. Com a arena inteira dentro do quadro, "nao enquadrado" passou
 * a ser um conjunto quase sempre vazio, e o inimigo nascia a vista sem opcao —
 * o teste de `wavePlan` pegou isso na hora. O que continua escasso, e portanto o
 * que o spawn evita, e o ALCANCE.
 *
 * `coneDeg` e opcional so para teste do caso degenerado (forcar um cone maior
 * que o arco inteiro); o codigo de produto chama so com `(cameraYawDeg, rng)`.
 */
export function pickSpawnSector(
  cameraYawDeg: number,
  rng: () => number,
  fovDeg: number = DEPLOY_CONE_DEG
): SectorId {
  const reachable = new Set(framedSectors(cameraYawDeg, fovDeg));
  const free = SECTOR_IDS.filter((sector) => !reachable.has(sector));
  const pool = free.length > 0 ? free : SECTOR_IDS;
  const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[idx];
}
