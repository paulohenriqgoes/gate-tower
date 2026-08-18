/**
 * Modelo polar puro da arena: setor, azimute, raio, o que esta enquadrado e
 * onde e legal colocar tropa. Logica pura, sem Babylon e sem cena — fonte
 * unica de verdade sobre "onde e isso no arco".
 *
 * Ver Etapa 1 de `docs/guias/tower_gate_v3_plano_etapas.md` e spec v3 §1, §2, §4.
 */

/** Arco total da arena, em graus. Parametrizavel — trocar para 120 nao pode quebrar a logica abaixo. */
export const ARENA_ARC_DEG = 180;
/** Numero de setores (flancos) em que o arco e dividido. */
export const ARENA_SECTOR_COUNT = 3;
/** Raio da arena, em metros. Ajustavel em [2.0, 2.5] conforme o espaco detectado. */
export const ARENA_RADIUS_M = 2.2;
/** Raio minimo de colocacao a partir da torre (spec §4) — sem ele o jogador otimo empilha tudo na base. */
export const MIN_PLACE_RADIUS_M = 0.9;
/** FOV util do device em retrato (varia por aparelho, este e o valor de referencia). */
export const DEVICE_FOV_DEG = 60;

export type SectorId = "left" | "center" | "right";

/** Ponto 2D no espaco local da arena (y = 0 sempre). */
export interface ArenaPoint2D {
  x: number;
  z: number;
}

/**
 * Azimute em graus. 0 = a direcao para onde o celular apontava quando a arena
 * fechou. Positivo cresce para a DIREITA do jogador. Frente = -Z, direita = +X
 * (sistema destro, como o modulo Babylon do 8th Wall configura a cena).
 */
export interface ArcPoint {
  azimuthDeg: number;
  radiusM: number;
}

export type PlacementVerdict =
  | { ok: true }
  | { ok: false; reason: "fora-do-arco" | "perto-demais" | "longe-demais" };

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

/** Normaliza um angulo em graus para o intervalo (-180, +180]. */
function normalizeAngleDeg(deg: number): number {
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
  const azimuthDeg = radToDeg(Math.atan2(p.x, -p.z));
  return { azimuthDeg, radiusM };
}

/** Converte um ponto polar (azimute/raio) para o espaco local (metros, y implicito 0). Inverso exato de `toArc`. */
export function toLocal(p: ArcPoint): ArenaPoint2D {
  const rad = degToRad(p.azimuthDeg);
  return {
    x: p.radiusM * Math.sin(rad),
    z: -p.radiusM * Math.cos(rad)
  };
}

/**
 * Avalia se um ponto polar e um lugar legal para colocar tropa.
 *
 * Ordem de recusa, deterministica: fora do arco vem antes de perto demais,
 * que vem antes de longe demais. Um ponto fora do arco nunca reporta raio —
 * a pergunta "esse raio serve?" so faz sentido depois de confirmar que o
 * azimute cai dentro de algum setor.
 */
export function evaluatePlacement(p: ArcPoint): PlacementVerdict {
  if (sectorOf(p.azimuthDeg) === null) {
    return { ok: false, reason: "fora-do-arco" };
  }
  if (p.radiusM < MIN_PLACE_RADIUS_M) {
    return { ok: false, reason: "perto-demais" };
  }
  if (p.radiusM > ARENA_RADIUS_M) {
    return { ok: false, reason: "longe-demais" };
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

/** Setores que o celular cobre agora. Vazio quando o jogador olha para fora do arco. */
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
 * Setor de spawn. NUNCA um setor enquadrado, salvo se todos estiverem — nesse
 * caso degenerado sorteia entre todos em vez de travar sem opcao.
 *
 * `fovDeg` e opcional so para teste do caso degenerado (forcar um cone maior
 * que o arco inteiro); o codigo de produto chama so com `(cameraYawDeg, rng)`
 * e usa `DEVICE_FOV_DEG`.
 */
export function pickSpawnSector(
  cameraYawDeg: number,
  rng: () => number,
  fovDeg: number = DEVICE_FOV_DEG
): SectorId {
  const framed = new Set(framedSectors(cameraYawDeg, fovDeg));
  const free = SECTOR_IDS.filter((sector) => !framed.has(sector));
  const pool = free.length > 0 ? free : SECTOR_IDS;
  const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[idx];
}
