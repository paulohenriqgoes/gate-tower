/**
 * A altura declarada do jogador — o numero que POE O PISO EM ZERO.
 *
 * A camera de RA nasce em `(0, altura, 0)` e o manager declara essa mesma
 * origem ao engine. O 8th Wall trata `origin` como "onde a camera comeca na
 * cena", entao o chao real cai exatamente em `y = 0` no frame zero — sem
 * hitTest, sem fit de plano, sem gate. Medido em device (2026-08-19): melhor
 * calibracao com `delta 0.00` a 1,55 m declarado.
 *
 * Este modulo e a fonte unica do valor porque ele nao pode divergir entre a
 * tela inicial, o controle da sessao e o que vai para o engine: os tres
 * escrevem o MESMO `origin.y`.
 *
 * ## Por que tudo aqui e total, e nada lanca
 *
 * `origin` com valor nao-finito contamina o frame do engine de forma
 * PERMANENTE — nao existe caminho de volta sem reiniciar a sessao. Entao
 * `normalizePlayerHeightM` nunca devolve NaN, nunca devolve fora da faixa, e
 * nunca lanca: entrada impossivel vira o default. Nao ha caminho por onde um
 * numero ruim chegue ao engine.
 */

/** Faixa e passo em CENTIMETROS inteiros — ver `normalizePlayerHeightM`. */
const MIN_CM = 130;
const MAX_CM = 205;
const STEP_CM = 5;
const DEFAULT_CM = 155;

export const PLAYER_HEIGHT_MIN_M = MIN_CM / 100;
export const PLAYER_HEIGHT_MAX_M = MAX_CM / 100;
export const PLAYER_HEIGHT_STEP_M = STEP_CM / 100;
export const DEFAULT_PLAYER_HEIGHT_M = DEFAULT_CM / 100;

/** Chave do valor persistido. Versionada no nome para poder mudar de formato. */
export const PLAYER_HEIGHT_STORAGE_KEY = "tower-gate.player-height-m";

/** O pedaco de `localStorage` que este modulo usa, para poder ser fingido no teste. */
export interface PlayerHeightStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Poe a altura na faixa, na grade de 5 cm, e sempre finita.
 *
 * A conta e feita em centimetros INTEIROS de proposito. Somar 0,05 em ponto
 * flutuante acumula erro (`1.55 + 0.05 === 1.6000000000000001`), e depois de
 * alguns toques no controle o valor exibido e o valor enviado ao engine
 * comecariam a divergir na terceira casa.
 */
export function normalizePlayerHeightM(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PLAYER_HEIGHT_M;
  }

  const snappedCm = Math.round((value * 100) / STEP_CM) * STEP_CM;

  return Math.min(MAX_CM, Math.max(MIN_CM, snappedCm)) / 100;
}

/** Anda `steps` passos de 5 cm a partir de `current`, parando nas pontas da faixa. */
export function stepPlayerHeightM(current: number, steps: number): number {
  if (!Number.isFinite(steps)) {
    return normalizePlayerHeightM(current);
  }

  return normalizePlayerHeightM(normalizePlayerHeightM(current) + steps * PLAYER_HEIGHT_STEP_M);
}

/** Le a altura persistida. Storage ausente, ilegivel ou com lixo devolve o default. */
export function readPlayerHeightM(storage: PlayerHeightStorage | null): number {
  if (!storage) {
    return DEFAULT_PLAYER_HEIGHT_M;
  }

  try {
    const raw = storage.getItem(PLAYER_HEIGHT_STORAGE_KEY);

    return raw === null ? DEFAULT_PLAYER_HEIGHT_M : normalizePlayerHeightM(Number.parseFloat(raw));
  } catch {
    return DEFAULT_PLAYER_HEIGHT_M;
  }
}

/**
 * Persiste a altura ja normalizada. Nunca lanca: no Safari em navegacao
 * privada `setItem` estoura, e perder a preferencia e muito melhor do que
 * derrubar a entrada em RA por causa dela.
 */
export function writePlayerHeightM(storage: PlayerHeightStorage | null, value: number): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(PLAYER_HEIGHT_STORAGE_KEY, normalizePlayerHeightM(value).toFixed(2));
  } catch (error) {
    console.warn("[playerHeight] nao foi possivel persistir a altura declarada.", error);
  }
}

/** Rotulo do controle, em pt-BR: `1,55 m`. */
export function formatPlayerHeightM(value: number): string {
  return `${normalizePlayerHeightM(value).toFixed(2).replace(".", ",")} m`;
}

/**
 * `localStorage` quando ele existe e responde. Em iframe sem permissao e no
 * Safari privado o simples ACESSO ao objeto ja lanca — por isso o try/catch
 * envolve a leitura da propriedade, e nao so o uso dela.
 */
export function browserPlayerHeightStorage(): PlayerHeightStorage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
