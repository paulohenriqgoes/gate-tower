import type { WaveSpec } from "./WaveDirector";

/**
 * Plano de ondas da partida de 3 minutos (JG-04). Substitui o `ENEMY_SCRIPT`
 * da v2, que era uma lista de posicoes `x/z` fixas na arena retangular: aqui
 * so o QUANDO e o QUE sao autorados, porque o ONDE deixou de ser decisao de
 * conteudo — quem escolhe o setor e o `WaveDirector`, por frame, olhando para
 * onde o jogador esta apontando o celular (spec v3 §3, §6).
 *
 * A cadencia foi preservada de proposito, para nao trocar duas variaveis ao
 * mesmo tempo: as 5 primeiras ondas cobrem 0-118 s (~23,6 s de intervalo) e as
 * 5 ultimas cobrem 128-176 s (~11,6 s), dobrando a pressao no ultimo minuto no
 * mesmo compasso em que a economia do jogador dobra
 * (`onFinalMinuteObservable` -> cogumelo em dobro).
 *
 * **Nenhum destes numeros e decidido por spec** (invariante do quadro): eles
 * sao tuning e so mudam por playtest. Estao aqui, num arquivo de dados puro,
 * exatamente para poderem mudar sem tocar em logica.
 */
export const WAVE_PLAN: WaveSpec[] = [
  { atMs: 12_000, entries: [{ cardId: "javali-raivoso", count: 1 }] },
  { atMs: 34_000, entries: [{ cardId: "tatu-bola", count: 1 }] },
  { atMs: 58_000, entries: [{ cardId: "dona-barata", count: 1 }] },
  { atMs: 88_000, entries: [{ cardId: "cururu-bombado", count: 1 }] },
  { atMs: 118_000, entries: [{ cardId: "javali-raivoso", count: 1 }] },
  // Ultimo minuto (a partir de 120000 ms): cadencia dobrada. A onda de 154 s
  // e a primeira com DOIS inimigos na mesma leva — e o `WaveDirector` sorteia
  // o setor de cada um separadamente, relendo a camera, entao dois inimigos da
  // mesma onda podem nascer em flancos diferentes. E o primeiro momento em que
  // o jogador nao consegue cobrir tudo olhando para um lugar so.
  { atMs: 128_000, entries: [{ cardId: "tatu-bola", count: 1 }] },
  { atMs: 142_000, entries: [{ cardId: "dona-barata", count: 1 }] },
  { atMs: 154_000, entries: [{ cardId: "javali-raivoso", count: 2 }] },
  { atMs: 166_000, entries: [{ cardId: "cururu-bombado", count: 1 }] },
  { atMs: 176_000, entries: [{ cardId: "javali-raivoso", count: 2 }] },
];

/**
 * Carta que a torre revela ao acordar: a PRIMEIRA do plano, a mesma que vai
 * aparecer primeiro na partida. Antes vinha de `ENEMY_SCRIPT[0].cardId`.
 */
export const FIRST_WAVE_CARD_ID = WAVE_PLAN[0].entries[0].cardId;
