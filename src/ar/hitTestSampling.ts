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

export interface PlaneCoverage {
  /** Extensão dos inliers ao longo da direção `forward`, em metros. */
  depth: number;
  /** Extensão dos inliers na direção perpendicular a `forward`, em metros. */
  width: number;
  /** Quantos pontos ficaram dentro da tolerância do plano. */
  inlierCount: number;
}

/**
 * Mede quanto da superfície ajustada por `fitGroundPlane` os hitTests realmente
 * cobrem, para decidir se a arena cabe ali. É a resposta a "a arena tem 80 cm;
 * essa mesa tem 80 cm?" — a arena NUNCA é reescalada para caber.
 *
 * Descarta os pontos que não pertencem ao plano (mesa vs. chão ao redor: um
 * ponto no piso fica a dezenas de centímetros do plano da mesa) e mede a caixa
 * envolvente dos que sobraram nos DOIS eixos da arena — `forward` (o eixo longo,
 * para onde o campo se estende) e o perpendicular.
 *
 * O valor devolvido é um limite INFERIOR da superfície real: ele só enxerga até
 * onde os hitTests foram disparados.
 *
 * @param points    pontos do mundo (resultado de vários hitTests)
 * @param fit       plano de referência (posição + normal)
 * @param forward   direção horizontal do eixo longo da arena
 * @param tolerance distância máxima ao plano para o ponto contar (em metros)
 */
export function measurePlaneCoverage(
  points: Vector3[],
  fit: GroundPlaneFit,
  forward: Vector3,
  tolerance: number
): PlaneCoverage {
  const normal = fit.normal.lengthSquared() > 1e-6
    ? fit.normal.normalizeToNew()
    : new Vector3(0, 1, 0);

  // Projeta `forward` no plano e ortonormaliza; se degenerar (olhando reto para
  // baixo), cai num eixo qualquer perpendicular a normal.
  let axisDepth = forward.subtract(normal.scale(Vector3.Dot(forward, normal)));

  if (axisDepth.lengthSquared() < 1e-6) {
    axisDepth = Math.abs(normal.z) < 0.9
      ? new Vector3(0, 0, 1).subtract(normal.scale(normal.z))
      : new Vector3(1, 0, 0).subtract(normal.scale(normal.x));
  }

  axisDepth.normalize();
  const axisWidth = Vector3.Cross(normal, axisDepth).normalize();

  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  let minWidth = Number.POSITIVE_INFINITY;
  let maxWidth = Number.NEGATIVE_INFINITY;
  let inlierCount = 0;

  for (const point of points) {
    const offset = point.subtract(fit.position);

    if (Math.abs(Vector3.Dot(offset, normal)) > tolerance) {
      continue;
    }

    const alongDepth = Vector3.Dot(offset, axisDepth);
    const alongWidth = Vector3.Dot(offset, axisWidth);

    minDepth = Math.min(minDepth, alongDepth);
    maxDepth = Math.max(maxDepth, alongDepth);
    minWidth = Math.min(minWidth, alongWidth);
    maxWidth = Math.max(maxWidth, alongWidth);
    inlierCount += 1;
  }

  if (inlierCount === 0) {
    return { depth: 0, width: 0, inlierCount: 0 };
  }

  return {
    depth: maxDepth - minDepth,
    width: maxWidth - minWidth,
    inlierCount,
  };
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
