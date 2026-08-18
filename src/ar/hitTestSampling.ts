import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Converte um ponto tocado em pixels CSS (ex.: `scene.pointerX/Y` ou
 * `touch.clientX/Y`) para coordenadas normalizadas [0,1] esperadas por
 * `XR8.XrController.hitTest`, onde (0,0) = topo-esquerdo e (1,1) = base-direita.
 *
 * GOTCHA (bug real de QA): normalizar SEMPRE por `clientWidth/clientHeight`
 * (px CSS) — nunca por `engine.getRenderWidth/Height()` (px de dispositivo,
 * ×devicePixelRatio ~3 no mobile). Misturar faz o hitTest mirar no lugar errado.
 *
 * O resultado deve ser clampeado em [0,1].
 */
export function normalizeToCanvas(
  clientX: number,
  clientY: number,
  canvas: { clientWidth: number; clientHeight: number }
): { x: number; y: number } {
  let x: number;
  let y: number;

  if (canvas.clientWidth === 0) {
    x = 0;
  } else {
    x = clientX / canvas.clientWidth;
  }

  if (canvas.clientHeight === 0) {
    y = 0;
  } else {
    y = clientY / canvas.clientHeight;
  }

  // Clamp to [0, 1]
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));

  return { x, y };
}

/**
 * Gera offsets (em coords normalizadas [0,1]) de um padrão em anéis concêntricos
 * ao redor de um ponto central, para amostrar vários hitTests e depois fazer o
 * fit de plano. O primeiro offset deve ser sempre `{ dx: 0, dy: 0 }` (o centro).
 *
 * @param radius  raio máximo do anel externo, em coords normalizadas (ex.: 0.06)
 * @param rings   quantidade de anéis concêntricos (ex.: 2)
 * @param perRing pontos por anel, distribuídos angularmente (ex.: 6)
 */
export function buildSampleOffsets(
  radius: number,
  rings: number,
  perRing: number
): Array<{ dx: number; dy: number }> {
  const offsets: Array<{ dx: number; dy: number }> = [];

  // First element is always the center
  offsets.push({ dx: 0, dy: 0 });

  // For each ring from 1 to rings
  for (let r = 1; r <= rings; r++) {
    const ringRadius = radius * (r / rings);

    // For each point k in the ring
    for (let k = 0; k < perRing; k++) {
      const angle = 2 * Math.PI * (k / perRing);
      const dx = ringRadius * Math.cos(angle);
      const dy = ringRadius * Math.sin(angle);
      offsets.push({ dx, dy });
    }
  }

  return offsets;
}

export interface GroundPlaneFit {
  /** Centróide dos pontos inliers — a posição na altura real do piso. */
  position: Vector3;
  /** Normal do plano estimado, normalizada e orientada para cima (y > 0). */
  normal: Vector3;
}

/**
 * Amostras (normalizadas [0,1], (0,0) = topo-esquerdo) de uma FAIXA na metade
 * inferior da tela — onde, em retrato, aparece o chão à frente de quem está de
 * pé segurando o celular. É a amostragem que substituiu o anel ao redor do
 * ponto tocado quando a arena deixou de ser colocada num toque e passou a
 * nascer no jogador: não há mais ponto de toque para amostrar em volta.
 *
 * A faixa é uma grade `rows x cols`, distribuída uniformemente entre `yTop` e
 * `yBottom` na vertical e recuada de `xInset` de cada borda na horizontal. O
 * recuo lateral existe porque as quinas inferiores da tela pegam o chão em
 * incidência rasíssima (quase paralelo ao raio), onde o hitTest do SLAM é mudo
 * ou impreciso — e um ponto ruim ali entra no fit como outlier de altura.
 *
 * Ordem estável: linha de cima para baixo, e dentro de cada linha da esquerda
 * para a direita. Nada depende da ordem hoje (o fit é robusto a permutação),
 * mas depuração em device depende de a lista não embaralhar entre execuções.
 */
export function buildFloorBandSamples(
  rows: number,
  cols: number,
  yTop: number,
  yBottom: number,
  xInset: number
): Array<{ x: number; y: number }> {
  const samples: Array<{ x: number; y: number }> = [];

  if (rows < 1 || cols < 1) {
    return samples;
  }

  // Com uma linha/coluna só, o ponto vai para o meio da faixa em vez de colar
  // numa das pontas — divisão por zero seria o resultado ingênuo aqui.
  const rowStep = rows > 1 ? (yBottom - yTop) / (rows - 1) : 0;
  const xStart = xInset;
  const xEnd = 1 - xInset;
  const colStep = cols > 1 ? (xEnd - xStart) / (cols - 1) : 0;

  for (let row = 0; row < rows; row += 1) {
    const y = rows > 1 ? yTop + row * rowStep : (yTop + yBottom) / 2;

    for (let col = 0; col < cols; col += 1) {
      const x = cols > 1 ? xStart + col * colStep : 0.5;

      samples.push({
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      });
    }
  }

  return samples;
}

/**
 * Offsets em METROS no espaço LOCAL da arena (o mesmo de `ArenaArc.toLocal`:
 * -Z é o azimute 0, +X é a direita do jogador) das sondas de desobstrução: os
 * pontos dentro do raio mínimo de colocação onde um obstáculo real
 * (sofá, mesa de centro, parede) impediria a arena de fechar ali.
 *
 * Substitui `buildFootprintProbes`, que testava os 4 cantos e os 4 meios de
 * borda de um retângulo de 80 cm. Não há mais retângulo: o que precisa estar
 * livre é o entorno do jogador, e ele é polar.
 *
 * As sondas se distribuem em anéis concêntricos (raios `radiusM * r/rings`)
 * cobrindo o ARCO da arena, e não 360° — o que está atrás do jogador não
 * recebe conteúdo e não pode reprovar o fechamento.
 *
 * Cada anel leva `perRing` sondas, mas os anéis ÍMPARES as colocam nas
 * fronteiras do arco (pontas incluídas) e os PARES no meio de cada célula.
 * Sem essa defasagem os dois anéis ficam alinhados no mesmo azimute e a quina
 * de um móvel passa exatamente entre os raios, sem ser vista por nenhuma
 * sonda. Todas caem dentro de `[-arcDeg/2, +arcDeg/2]` nos dois casos.
 *
 * @param radiusM  raio do anel externo, em metros (o `MIN_PLACE_RADIUS_M`)
 * @param rings    quantidade de anéis concêntricos
 * @param perRing  sondas por anel
 * @param arcDeg   abertura do arco coberto, centrado no azimute 0
 */
export function buildClearanceProbeOffsets(
  radiusM: number,
  rings: number,
  perRing: number,
  arcDeg: number
): Array<{ dx: number; dz: number }> {
  const offsets: Array<{ dx: number; dz: number }> = [];

  if (rings < 1 || perRing < 1) {
    return offsets;
  }

  const half = arcDeg / 2;

  for (let ring = 1; ring <= rings; ring += 1) {
    const ringRadius = (radiusM * ring) / rings;
    const isStaggered = ring % 2 === 0;

    for (let k = 0; k < perRing; k += 1) {
      let azimuthDeg: number;

      if (perRing === 1) {
        azimuthDeg = 0;
      } else if (isStaggered) {
        azimuthDeg = -half + ((k + 0.5) * arcDeg) / perRing;
      } else {
        azimuthDeg = -half + (k * arcDeg) / (perRing - 1);
      }

      const rad = (azimuthDeg * Math.PI) / 180;

      offsets.push({ dx: ringRadius * Math.sin(rad), dz: -ringRadius * Math.cos(rad) });
    }
  }

  return offsets;
}

export interface ProbeCoverage {
  /** Sondas cuja projeção de tela caiu DENTRO do canvas. */
  inFrame: number;
  /** Sondas em quadro cujo hitTest bateu dentro da tolerância do plano ajustado. */
  onPlane: number;
  /**
   * Sondas em quadro que bateram em superfície REAL, porém fora da tolerância
   * do piso — o degrau que denuncia um obstáculo (ou, no modelo antigo de
   * mesa, a borda dela).
   *
   * É a única contagem que pode REPROVAR, e ela é diferente de
   * `inFrame - onPlane`: uma sonda que não bateu em nada não é prova de que
   * há obstáculo, é ausência de leitura. O hitTest do SLAM falha o tempo todo
   * em incidência rasa; tratar esse silêncio como "não pode" recusou 79
   * toques em dois testes de device, um deles apontando para o chão de uma
   * cozinha.
   */
  offPlane: number;
  /** Total de sondas avaliadas (incluindo as fora de quadro). */
  total: number;
}

/**
 * Classifica um conjunto de sondas já projetadas na tela e já testadas: quantas
 * caíram no quadro, e dentre essas quantas pertencem ao plano do piso (`fit`) e
 * quantas bateram em superfície real FORA dele.
 *
 * Uma sonda fora do quadro (screenX/screenY fora de [0,1], já normalizados
 * como `normalizeToCanvas` faz) não conta em nada. Uma sonda em quadro cujo
 * hitTest não bateu em superfície nenhuma (`hit === null`) conta em `inFrame`
 * mas nem em `onPlane` nem em `offPlane` — ela é silêncio do sensor, não
 * evidência em nenhuma das duas direções.
 *
 * @param probes           sondas já projetadas na tela e já testadas (ou não)
 * @param fit              plano de referência (posição + normal)
 * @param toleranceMeters  distância máxima ao plano para a sonda contar como "no plano"
 */
export function measureProbeCoverage(
  probes: { screenX: number; screenY: number; hit: Vector3 | null }[],
  fit: GroundPlaneFit,
  toleranceMeters: number
): ProbeCoverage {
  // Normal com fallback vertical: um fit degenerado não pode virar NaN no
  // meio de uma contagem que decide se o jogador pode ou não fechar a arena.
  const normal = fit.normal.lengthSquared() > 1e-6
    ? fit.normal.normalizeToNew()
    : new Vector3(0, 1, 0);

  let inFrame = 0;
  let onPlane = 0;
  let offPlane = 0;

  for (const probe of probes) {
    const isInFrame =
      probe.screenX >= 0 && probe.screenX <= 1 &&
      probe.screenY >= 0 && probe.screenY <= 1;

    if (!isInFrame) {
      continue;
    }

    inFrame += 1;

    if (probe.hit === null) {
      // Em quadro, mas o hitTest não bateu em nenhuma superfície ali.
      continue;
    }

    const offset = probe.hit.subtract(fit.position);
    const distanceToPlane = Math.abs(Vector3.Dot(offset, normal));

    if (distanceToPlane <= toleranceMeters) {
      onPlane += 1;
    } else {
      offPlane += 1;
    }
  }

  return { inFrame, offPlane, onPlane, total: probes.length };
}

/**
 * Faz o fit robusto de um plano a partir de pontos 3D do mundo retornados por
 * hitTests, para estimar a superfície real do chão.
 *
 * Robustez esperada:
 *  - Rejeitar outliers de altura (eixo Y) usando mediana + MAD
 *    (median absolute deviation).
 *  - Estimar a normal por mínimos quadrados tratando o chão como campo de
 *    altura `y = a·x + b·z + c` (resolvido por Cramer num sistema 3x3);
 *    normal = normalizar([-a, 1, -b]). Fallback (0,1,0) se o sistema for
 *    degenerado (determinante ~0, pontos colineares).
 *  - `position` = centróide dos inliers.
 *
 * @param points     pontos do mundo (resultado de vários hitTests)
 * @param minInliers mínimo de inliers para aceitar o fit (default 3)
 * @returns o plano estimado, ou `null` se não houver inliers suficientes.
 */
export function fitGroundPlane(points: Vector3[], minInliers = 3): GroundPlaneFit | null {
  if (points.length === 0) {
    return null;
  }

  // Helper: compute median
  function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  // Step 1: Outlier rejection by height (Y-axis)
  const yValues = points.map(p => p.y);
  const medianY = median(yValues);

  const deviations = points.map(p => Math.abs(p.y - medianY));
  const mad = median(deviations);

  let inliers: Vector3[];
  if (mad > 0) {
    inliers = points.filter(p => Math.abs(p.y - medianY) <= 3 * mad);
  } else {
    inliers = points.filter(p => Math.abs(p.y - medianY) <= 1e-6);
  }

  if (inliers.length < minInliers) {
    return null;
  }

  // Step 2: Compute centroid
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const p of inliers) {
    sumX += p.x;
    sumY += p.y;
    sumZ += p.z;
  }
  const n = inliers.length;
  const position = new Vector3(sumX / n, sumY / n, sumZ / n);

  // Step 3: Fit plane using least squares: y = a*x + b*z + c
  // Normal equations: A'A [a, b, c]' = A'y
  // where A is [x, z, 1] for each point
  let sumXX = 0, sumXZ = 0, sumXOne = 0;
  let sumZZ = 0, sumZOne = 0;
  let sumXY = 0, sumZY = 0, sumY_rhs = 0;

  for (const p of inliers) {
    const x = p.x;
    const z = p.z;
    const y = p.y;

    sumXX += x * x;
    sumXZ += x * z;
    sumXOne += x;
    sumZZ += z * z;
    sumZOne += z;
    sumXY += x * y;
    sumZY += z * y;
    sumY_rhs += y;
  }

  // Normal matrix: [[Σx², Σxz, Σx], [Σxz, Σz², Σz], [Σx, Σz, n]]
  // RHS: [Σxy, Σzy, Σy]

  const A = [
    [sumXX, sumXZ, sumXOne],
    [sumXZ, sumZZ, sumZOne],
    [sumXOne, sumZOne, n]
  ];

  const b = [sumXY, sumZY, sumY_rhs];

  // Helper: compute 3x3 determinant
  function det3x3(m: number[][]): number {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }

  // Helper: solve Ax = b using Cramer's rule
  function solveCramer(A: number[][], b: number[]): number[] | null {
    const detA = det3x3(A);
    if (Math.abs(detA) < 1e-9) {
      return null; // Degenerate system
    }

    // Solve for a
    const A_a = [
      [b[0], A[0][1], A[0][2]],
      [b[1], A[1][1], A[1][2]],
      [b[2], A[2][1], A[2][2]]
    ];
    const a = det3x3(A_a) / detA;

    // Solve for b
    const A_b = [
      [A[0][0], b[0], A[0][2]],
      [A[1][0], b[1], A[1][2]],
      [A[2][0], b[2], A[2][2]]
    ];
    const coeff_b = det3x3(A_b) / detA;

    // Solve for c
    const A_c = [
      [A[0][0], A[0][1], b[0]],
      [A[1][0], A[1][1], b[1]],
      [A[2][0], A[2][1], b[2]]
    ];
    const c = det3x3(A_c) / detA;

    return [a, coeff_b, c];
  }

  let normal: Vector3;
  const solution = solveCramer(A, b);

  if (solution === null) {
    // Degenerate case: use default up vector
    normal = new Vector3(0, 1, 0);
  } else {
    const [a, coeff_b, c] = solution;
    // normal = [-a, 1, -b]
    normal = new Vector3(-a, 1, -coeff_b);
    normal.normalize();
  }

  // Ensure normal points upward (y > 0)
  if (normal.y < 0) {
    normal.scaleInPlace(-1);
  }

  return { position, normal };
}
