/**
 * Diretor de ondas: decide QUANDO cada onda nasce e ONDE cada inimigo dela
 * aparece na borda do arco. Logica pura, sem Babylon — consome o modelo polar
 * de `ArenaArc` para nunca nascer num setor que o jogador esta enquadrando
 * (enquanto houver setor livre) e nunca nascer perto demais da torre.
 *
 * Ver Etapa 4 de `docs/guias/tower_gate_v3_plano_etapas.md` e spec v3 §3, §6.
 */

import {
  ARENA_RADIUS_M,
  evaluatePlacement,
  pickSpawnSector,
  sectorCenterDeg,
  sectorRangeDeg,
  type ArcPoint,
  type SectorId
} from "../arena/ArenaArc";

export interface WaveEntry {
  cardId: string;
  count: number;
}

export interface WaveSpec {
  atMs: number;
  entries: WaveEntry[];
}

export interface SpawnOrder {
  cardId: string;
  sector: SectorId;
  point: ArcPoint;
}

/**
 * Quanto o raio de nascimento pode variar para dentro a partir da borda do
 * arco (`ARENA_RADIUS_M`). Pequeno o bastante para continuar lendo como "veio
 * da borda", grande o bastante para uma leva de N inimigos nao empilhar no
 * mesmo ponto exato.
 */
const RADIUS_JITTER_M = 0.15;

/**
 * Fracao da largura do setor reservada como margem — nao gerar azimute nos
 * 8% mais proximos de cada fronteira. Existe por duas razoes: manter folga
 * de ponto flutuante em relacao a `evaluatePlacement`/`sectorOf` (que usam
 * tolerancia de fronteira), e evitar que um inimigo nasca visualmente colado
 * na fronteira com o setor vizinho — que pode estar enquadrado.
 */
const AZIMUTH_EDGE_MARGIN_FACTOR = 0.08;

interface PendingWave {
  spec: WaveSpec;
  fired: boolean;
}

/** Gera um ponto polar dentro de `sector`, na borda do arco com pequena variacao. */
function pickPointInSector(sector: SectorId, rng: () => number): ArcPoint {
  const [start, end] = sectorRangeDeg(sector);
  const width = end - start;
  const margin = width * AZIMUTH_EDGE_MARGIN_FACTOR;
  const usableWidth = Math.max(0, width - 2 * margin);
  const azimuthDeg = start + margin + rng() * usableWidth;
  const radiusM = ARENA_RADIUS_M - rng() * RADIUS_JITTER_M;
  return { azimuthDeg, radiusM };
}

/**
 * Ponto de nascimento para `sector`: gerado com jitter e validado contra
 * `evaluatePlacement`. Se por qualquer motivo (rng extremo, ponto flutuante)
 * o ponto gerado nao passar, cai para um ponto seguro e deterministico no
 * centro do setor, na borda do arco — a garantia de `ok: true` nunca e
 * quebrada por conta desta funcao.
 */
function spawnPointInSector(sector: SectorId, rng: () => number): ArcPoint {
  const candidate = pickPointInSector(sector, rng);
  if (evaluatePlacement(candidate).ok) {
    return candidate;
  }
  const fallback: ArcPoint = { azimuthDeg: sectorCenterDeg(sector), radiusM: ARENA_RADIUS_M - RADIUS_JITTER_M / 2 };
  return fallback;
}

export class WaveDirector {
  private readonly pending: PendingWave[];
  private readonly getCameraYawDeg: () => number;
  private readonly rng: () => number;

  constructor(opts: { waves: WaveSpec[]; getCameraYawDeg: () => number; rng?: () => number }) {
    // Ordenado por atMs crescente para que, num salto grande de tempo, as
    // ondas disparem na ordem certa dentro de uma unica chamada de update().
    // sort() e estavel (garantia ES2019+): ondas com o mesmo atMs mantem a
    // ordem original em que foram passadas.
    this.pending = [...opts.waves]
      .sort((a, b) => a.atMs - b.atMs)
      .map((spec) => ({ spec, fired: false }));
    this.getCameraYawDeg = opts.getCameraYawDeg;
    this.rng = opts.rng ?? Math.random;
  }

  /**
   * Chamado por frame com o tempo total decorrido (nao delta). Dispara, em
   * ordem crescente de atMs, toda onda pendente cujo atMs <= elapsedMs — o
   * que cobre tanto o caso normal (uma onda por chamada) quanto um salto
   * grande de tempo (varias ondas na mesma chamada). O estado de disparo e
   * guardado por onda (`fired`), nao comparado com o ultimo elapsedMs visto:
   * assim tempo andando para tras nunca reemite uma onda ja disparada.
   */
  update(elapsedMs: number): SpawnOrder[] {
    const orders: SpawnOrder[] = [];

    for (const wave of this.pending) {
      if (wave.fired) continue;
      if (wave.spec.atMs > elapsedMs) continue;

      wave.fired = true;
      for (const entry of wave.spec.entries) {
        for (let i = 0; i < entry.count; i++) {
          // Setor sorteado por inimigo, relendo a camera a cada sorteio: se
          // o jogador virar o celular no meio da leva, o resto da leva
          // respeita a nova posicao de atencao.
          const sector = pickSpawnSector(this.getCameraYawDeg(), this.rng);
          const point = spawnPointInSector(sector, this.rng);
          orders.push({ cardId: entry.cardId, sector, point });
        }
      }
    }

    return orders;
  }

  /** Volta ao estado inicial: todas as ondas voltam a ser pendentes. */
  reset(): void {
    for (const wave of this.pending) {
      wave.fired = false;
    }
  }
}
