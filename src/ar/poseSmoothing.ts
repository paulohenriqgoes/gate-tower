/**
 * Suavizacao exponencial da pose da RA (origem da arena e heading da camera).
 *
 * Duas leituras cruas por frame — a projecao do celular no chao (origem) e o
 * azimute para onde ele aponta (heading) — alimentam hoje a arena sem filtro
 * nenhum. Medido em device: 2 graus de tremor de mao na camera viram 7,7 cm de
 * deslocamento na borda do arco de 2,2 m, e o contorno "nao fica parado".
 *
 * Mas existe um segundo fenomeno que NAO pode ser suavizado: o SLAM do 8th
 * Wall, ao relocalizar, da um salto em degrau (0,53 m, 1,44 m e 2,53 m foram
 * medidos numa sessao real). Suavizar um salto desses transformaria um
 * teletransporte instantaneo numa varredura lenta e nauseante. Por isso as
 * duas classes abaixo tem SNAP: acima de um limiar, o valor cru e adotado
 * direto, sem interpolar.
 *
 * A suavizacao e exponencial e independente de frame rate:
 * `alpha = 1 - exp(-dt / tau)`. A 30 e a 60 fps o mesmo intervalo de tempo
 * real produz a mesma resposta — um alpha fixo por frame (ex: "0.1 por
 * frame") nao produziria, porque a 60 fps ele filtraria o dobro de vezes no
 * mesmo tempo, ficando mais lento a alto FPS e mais nervoso a baixo FPS.
 */

import { normalizeAngleDeg } from "./arenaHeading";

/** Alpha do filtro exponencial para um passo de tempo `dtSeconds` e constante `tauSeconds`. */
function computeAlpha(dtSeconds: number, tauSeconds: number): number {
  const alpha = 1 - Math.exp(-dtSeconds / tauSeconds);

  if (alpha < 0) {
    return 0;
  }

  if (alpha > 1) {
    return 1;
  }

  return alpha;
}

/**
 * Suavizacao exponencial de um escalar generico (ex: uma coordenada da
 * origem da arena, em metros). Independente de frame rate: alpha = 1 -
 * exp(-dt / tau). A 30 e a 60 fps o mesmo tempo real produz a mesma resposta
 * — com um alpha fixo por frame nao produziria.
 *
 * Nao existe uma classe de vetor: quem precisa suavizar uma posicao (x, z)
 * usa dois `SmoothedScalar` independentes, um por eixo.
 */
export class SmoothedScalar {
  private readonly tauSeconds: number;
  private readonly snapThreshold: number;
  private value: number | null = null;

  constructor(tauSeconds: number, snapThreshold: number) {
    this.tauSeconds = tauSeconds;
    this.snapThreshold = snapThreshold;
  }

  /** Consome um valor cru e o passo de tempo em SEGUNDOS; devolve o valor suavizado. */
  push(value: number, dtSeconds: number): number {
    // Sem valor vigente nao ha de onde interpolar: o primeiro push adota o
    // valor cru direto, mesmo que dtSeconds seja invalido.
    if (this.value === null) {
      this.value = value;
      return this.value;
    }

    // Um dt invalido (frame com timestamp quebrado, tab em background, etc)
    // nao carrega informacao de quanto tempo passou de verdade. Em vez de
    // arriscar um alpha absurdo, o frame e descartado e o valor atual fica.
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return this.value;
    }

    const delta = value - this.value;

    // Salto de relocalizacao do SLAM: acima do limiar, nao e ruido de mao, e
    // teletransporte. Suavizar isso vira uma varredura lenta e nauseante —
    // o correto e adotar o valor cru na hora.
    if (Math.abs(delta) >= this.snapThreshold) {
      this.value = value;
      return this.value;
    }

    const alpha = computeAlpha(dtSeconds, this.tauSeconds);
    this.value += alpha * delta;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/**
 * Mesma ideia de `SmoothedScalar`, para um angulo em GRAUS. A diferenca e que
 * a distancia entre dois angulos nao e a subtracao direta — e o caminho
 * curto: de 179 para -179 a distancia real e 2 graus (passando por 180), nao
 * 358. Toda a matematica de delta, snap e interpolacao usa esse caminho
 * curto, e o resultado e sempre normalizado de volta para (-180, +180] via
 * `normalizeAngleDeg` (a mesma convencao de `arenaHeading.ts`).
 */
export class SmoothedAngleDeg {
  private readonly tauSeconds: number;
  private readonly snapThresholdDeg: number;
  private value: number | null = null;

  constructor(tauSeconds: number, snapThresholdDeg: number) {
    this.tauSeconds = tauSeconds;
    this.snapThresholdDeg = snapThresholdDeg;
  }

  push(valueDeg: number, dtSeconds: number): number {
    const normalized = normalizeAngleDeg(valueDeg);

    if (this.value === null) {
      this.value = normalized;
      return this.value;
    }

    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return this.value;
    }

    // `normalizeAngleDeg` de uma diferenca em (-360, 360) devolve o delta do
    // caminho curto, corretamente assinado — e o mesmo truque que
    // `relativeYawDeg` usa em arenaHeading.ts.
    const delta = normalizeAngleDeg(normalized - this.value);

    if (Math.abs(delta) >= this.snapThresholdDeg) {
      this.value = normalized;
      return this.value;
    }

    const alpha = computeAlpha(dtSeconds, this.tauSeconds);
    this.value = normalizeAngleDeg(this.value + alpha * delta);
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

// Constantes de sintonia usadas pela RA (fiacao feita em outra etapa, em
// EighthWallARManager.ts). Os valores nascem da medicao citada no topo do
// arquivo: tau pequeno o bastante para nao atrasar visivelmente o contorno,
// snap grande o bastante para nunca confundir um salto real de SLAM com
// tremor de mao.
export const ORIGIN_TAU_SECONDS = 0.15;
export const ORIGIN_SNAP_M = 0.3;
export const HEADING_TAU_SECONDS = 0.12;
export const HEADING_SNAP_DEG = 25;
