/**
 * Estimativa e ESTABILIZACAO da altura do piso, isolada do Babylon.
 *
 * ## O problema que este arquivo resolve
 *
 * `fitGroundPlane` (`hitTestSampling.ts`) refaz o fit do zero a cada ~200ms, a
 * partir de ~12 hitTests do SLAM, e o resultado de hoje e aplicado direto na
 * cena sem filtro nenhum. Medido em device: o contorno da arena pula, inclina
 * e muda de lugar 5x por segundo, e uma ancoragem registrou o "chao" 40cm
 * acima de onde ele realmente estava. O SLAM do 8th Wall e ruidoso amostra a
 * amostra — cada fit isolado e uma opiniao, nao um fato — e aplicar cada
 * opiniao direto na cena e o que produz o pulo.
 *
 * Este modulo separa as duas responsabilidades que estavam misturadas:
 *
 *  - `measureFloor` mede UMA amostra (um fit robusto por mediana+MAD, igual
 *    em espirito ao de `fitGroundPlane`, mas medindo altura em vez de
 *    devolver so um plano para renderizar).
 *  - `FloorTracker` consome uma SEQUENCIA de medicoes ao longo do tempo e
 *    devolve uma altura estavel: ruido de poucos cm vira suavizacao (EMA),
 *    mudanca real de piso (um degrau) so e aceita depois de varias amostras
 *    seguidas concordando — porque um unico fit ruim nao pode mais mover a
 *    arena inteira 40cm.
 *
 * Este arquivo e AUTONOMO de proposito: nao importa `@babylonjs/core` nem
 * `hitTestSampling.ts`. `Point3` e a mesma forma que `Vector3` satisfaz
 * estruturalmente, entao quem chama passa `Vector3`s direto sem conversao,
 * mas o modulo em si nao sabe que Babylon existe — o teste roda sem engine.
 */

/** Ponto do mundo, estrutural de proposito: este modulo nao importa Babylon. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface FloorSample {
  /** Altura do piso: MEDIANA do Y dos inliers, nao o centroide. */
  floorY: number;
  /**
   * Inclinacao do plano ajustado em relacao a vertical, em GRAUS. Medida
   * para diagnostico — quem chama nunca deve aplicar isto na cena (a arena
   * sempre fica na horizontal; um piso real "inclinado" quase sempre e
   * ruido do SLAM, nao geometria para copiar).
   */
  tiltDeg: number;
  /** Amplitude (max - min) do Y dos inliers, em metros. */
  spreadM: number;
  /** Quantos pontos sobreviveram a rejeicao de outlier. */
  inliers: number;
}

/** Mediana de uma lista de numeros. Lista vazia devolve 0 (nao deve acontecer nos chamadores internos, que sempre filtram antes). */
function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

/** Determinante 3x3, para o mesmo Cramer que `fitGroundPlane` usa. */
function det3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Resolve Ax=b 3x3 por Cramer. `null` = sistema degenerado (pontos colineares). */
function solveCramer(A: number[][], b: number[]): number[] | null {
  const detA = det3x3(A);

  if (Math.abs(detA) < 1e-9) {
    return null;
  }

  const Aa = [
    [b[0], A[0][1], A[0][2]],
    [b[1], A[1][1], A[1][2]],
    [b[2], A[2][1], A[2][2]],
  ];
  const Ab = [
    [A[0][0], b[0], A[0][2]],
    [A[1][0], b[1], A[1][2]],
    [A[2][0], b[2], A[2][2]],
  ];
  const Ac = [
    [A[0][0], A[0][1], b[0]],
    [A[1][0], A[1][1], b[1]],
    [A[2][0], A[2][1], b[2]],
  ];

  return [det3x3(Aa) / detA, det3x3(Ab) / detA, det3x3(Ac) / detA];
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Mede UMA amostra de piso a partir de pontos de hitTest.
 *
 * A rejeicao de outlier (mediana + MAD do eixo Y, tolerancia `3*mad`, ou
 * `1e-6` quando `mad === 0`) e a MESMA politica de `fitGroundPlane`. Ela nao
 * foi reinventada aqui — foi copiada de proposito, porque e uma politica ja
 * validada em device, e este modulo precisa ficar independente de
 * `hitTestSampling.ts` (etapas diferentes, arquivos diferentes).
 *
 * `minInliers` default 3 e NAO deve subir. Historico do projeto: exigir mais
 * prova positiva do sensor (minInliers alto) ja produziu 79 recusas de
 * ancoragem e zero sucessos em dois testes de device — o sensor
 * simplesmente nao devolve tantos pontos bons por rodada. A robustez contra
 * ruido aqui e trabalho da mediana (dentro de uma amostra) e do
 * `FloorTracker` (entre amostras), nao de um minimo de pontos mais rigoroso.
 */
export function measureFloor(
  points: readonly Point3[],
  minInliers = 3
): FloorSample | null {
  if (points.length === 0) {
    return null;
  }

  // Passo 1: rejeicao de outlier por altura (eixo Y), igual a fitGroundPlane.
  const yValues = points.map((p) => p.y);
  const medianY = median(yValues);
  const deviations = points.map((p) => Math.abs(p.y - medianY));
  const mad = median(deviations);
  const tolerance = mad > 0 ? 3 * mad : 1e-6;
  const inliers = points.filter((p) => Math.abs(p.y - medianY) <= tolerance);

  if (inliers.length < minInliers) {
    return null;
  }

  // floorY e a MEDIANA dos inliers, nao o centroide: um punhado de pontos
  // levemente altos de um lado (por exemplo, o SLAM pegando a quina de um
  // degrau) desloca a media para aquele lado, mas nao move a mediana — e
  // exatamente a diferenca que motivou trocar centroide por mediana aqui.
  const inlierYs = inliers.map((p) => p.y);
  const floorY = median(inlierYs);
  const spreadM = Math.max(...inlierYs) - Math.min(...inlierYs);

  // Passo 2: fit de plano por minimos quadrados nos inliers, so para medir
  // inclinacao (diagnostico). y = a*x + b*z + c, normal = norm([-a, 1, -b]).
  let sumXX = 0,
    sumXZ = 0,
    sumX = 0;
  let sumZZ = 0,
    sumZ = 0;
  let sumXY = 0,
    sumZY = 0,
    sumY = 0;
  const n = inliers.length;

  for (const p of inliers) {
    sumXX += p.x * p.x;
    sumXZ += p.x * p.z;
    sumX += p.x;
    sumZZ += p.z * p.z;
    sumZ += p.z;
    sumXY += p.x * p.y;
    sumZY += p.z * p.y;
    sumY += p.y;
  }

  const A = [
    [sumXX, sumXZ, sumX],
    [sumXZ, sumZZ, sumZ],
    [sumX, sumZ, n],
  ];
  const b = [sumXY, sumZY, sumY];
  const solution = solveCramer(A, b);

  let tiltDeg: number;

  if (solution === null) {
    // Sistema degenerado (pontos colineares): nao ha plano unico para medir
    // inclinacao. 0 e o valor mais seguro — nao ha evidencia de inclinacao,
    // entao nao inventamos uma.
    tiltDeg = 0;
  } else {
    const [a, coeffB] = solution;
    let nx = -a;
    let ny = 1;
    let nz = -coeffB;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (len > 1e-9) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }

    // Orienta para cima antes de medir o angulo com a vertical.
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    // Angulo entre a normal e (0,1,0) e simplesmente acos(ny), ja que ambos
    // sao vetores unitarios. Clamp contra erro de ponto flutuante levando
    // ny levemente acima de 1 (acos daria NaN).
    const clampedNy = Math.max(-1, Math.min(1, ny));
    tiltDeg = Math.acos(clampedNy) * RAD_TO_DEG;
  }

  return { floorY, tiltDeg, spreadM, inliers: inliers.length };
}

// --- FloorTracker: o filtro temporal entre amostras ------------------------

/**
 * Ate 5cm de diferenca entre a altura vigente e uma nova amostra e tratado
 * como ruido de medicao, nao como um degrau real — o SLAM sozinho ja varia
 * nessa faixa amostra a amostra parado no mesmo lugar.
 */
export const JUMP_TOLERANCE_M = 0.05;

/**
 * Peso do EMA (`current += alpha * (sample - current)`) quando a amostra
 * esta dentro da tolerancia. 0.25 converge em poucas amostras (a ~5Hz, menos
 * de 1s) sem deixar cada leitura ruidosa isolada mover a altura em cheio.
 */
export const EMA_ALPHA = 0.25;

/**
 * Quantas amostras SEGUIDAS e CONCORDANTES fora da tolerancia sao exigidas
 * antes de aceitar um degrau real. A ~5Hz (o ciclo de hitTest hoje, 200ms),
 * 3 amostras sao ~600ms de acordo continuo — rapido o bastante para o
 * jogador nao notar atraso ao subir um degrau de verdade, lento o bastante
 * para nao confundir um unico fit ruim (a causa dos 40cm perdidos) com
 * geometria nova.
 */
export const AGREEING_SAMPLES_TO_JUMP = 3;

/**
 * Amostra cujo `spreadM` passa disso e descartada inteira (tratada como
 * `null`). Acima de 12cm o fit provavelmente misturou pontos do chao com
 * pontos de um movel, degrau ou quina — nao e mais uma medicao de piso, e
 * lixo que nao deve nem virar candidato a degrau.
 */
export const MAX_SPREAD_M = 0.12;

export interface FloorTrackerOptions {
  jumpToleranceM?: number;
  alpha?: number;
  agreeingSamplesToJump?: number;
  maxSpreadM?: number;
}

/**
 * Estabiliza uma sequencia de `FloorSample` ao longo do tempo numa unica
 * altura de piso. E o pedaco que faltava no pipeline de hoje: sem isto, cada
 * fit de 200ms em 200ms e aplicado cru na cena.
 *
 * Politica (ver spec da Etapa 1 para a tabela completa):
 *  1. `push(null)` preserva tudo — silencio do sensor e "nao sei", nunca
 *     "mudou". Tambem preserva a sequencia de candidatos a degrau em
 *     andamento, para nao penalizar um frame isolado sem hitTest.
 *  2. Amostra com `spreadM` acima de `maxSpreadM` e descartada como se fosse
 *     `null` (mesma regra do item 1).
 *  3. Sem altura vigente, a primeira amostra valida vira `current` direto —
 *     nao ha o que suavizar contra nada.
 *  4. Amostra dentro de `jumpToleranceM` do `current`: EMA, candidatos
 *     zeram (a serie de degrau, se havia uma comecando, foi interrompida
 *     por uma leitura normal).
 *  5. Amostra fora da tolerancia: candidata a degrau. So vira `current`
 *     depois de `agreeingSamplesToJump` amostras seguidas que concordam
 *     entre si (cada uma dentro de `jumpToleranceM` da candidata anterior).
 *     Ao completar a serie, `current` vira a MEDIANA das candidatas.
 */
export class FloorTracker {
  private readonly jumpToleranceM: number;
  private readonly alpha: number;
  private readonly agreeingSamplesToJump: number;
  private readonly maxSpreadM: number;

  private currentY: number | null = null;
  /**
   * Amostras fora da tolerancia, ainda concordando entre si em sequencia.
   * Uma amostra que quebra a concordancia (ou que caia dentro da tolerancia
   * do `current`) zera esta lista. Quando uma amostra fora da tolerancia
   * quebra a concordancia com a serie anterior, ela nao e descartada — vira
   * o primeiro elemento de uma serie NOVA, para nao desperdicar a leitura
   * caso o piso esteja de fato mudando numa direcao diferente da tentativa
   * anterior. Essa e uma decisao de implementacao: a spec descreve "zera o
   * contador" sem dizer se a amostra que quebrou a serie conta como a
   * primeira da proxima.
   */
  private candidates: number[] = [];

  constructor(options: FloorTrackerOptions = {}) {
    this.jumpToleranceM = options.jumpToleranceM ?? JUMP_TOLERANCE_M;
    this.alpha = options.alpha ?? EMA_ALPHA;
    this.agreeingSamplesToJump = options.agreeingSamplesToJump ?? AGREEING_SAMPLES_TO_JUMP;
    this.maxSpreadM = options.maxSpreadM ?? MAX_SPREAD_M;
  }

  /** Consome uma medicao (ou `null`, quando nao houve fit) e devolve a altura vigente. */
  push(sample: FloorSample | null): number | null {
    if (sample === null) {
      return this.currentY;
    }

    if (sample.spreadM > this.maxSpreadM) {
      // Amostra suja (chao misturado com outra coisa): mesmo tratamento de
      // `null`. Nao mexe em `current` nem na serie de candidatos.
      return this.currentY;
    }

    if (this.currentY === null) {
      this.currentY = sample.floorY;
      this.candidates = [];
      return this.currentY;
    }

    const diff = sample.floorY - this.currentY;

    if (Math.abs(diff) <= this.jumpToleranceM) {
      this.currentY = this.currentY + this.alpha * diff;
      this.candidates = [];
      return this.currentY;
    }

    // Fora da tolerancia: candidata a degrau. Concorda com a ultima
    // candidata da serie em andamento?
    const lastCandidate = this.candidates[this.candidates.length - 1];
    const agreesWithSeries =
      this.candidates.length > 0 && Math.abs(sample.floorY - lastCandidate) <= this.jumpToleranceM;

    if (agreesWithSeries) {
      this.candidates.push(sample.floorY);
    } else {
      this.candidates = [sample.floorY];
    }

    if (this.candidates.length >= this.agreeingSamplesToJump) {
      this.currentY = median(this.candidates);
      this.candidates = [];
    }

    return this.currentY;
  }

  get current(): number | null {
    return this.currentY;
  }

  reset(): void {
    this.currentY = null;
    this.candidates = [];
  }
}
