import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O Babylon GUI aceita apenas `px` e `%` em `width`/`height`. Qualquer outra
 * unidade e engolida em silencio: `ValueAndUnit._Regex` casa string vazia,
 * `parseFloat("")` devolve NaN, o controle fica sem tamanho e simplesmente nao
 * renderiza. Nao lanca, nao avisa, e o `tsc` nao pega — `height` e `string`.
 *
 * Foi assim que a fileira de cartas sumiu da tela em duas sessoes de device,
 * com build verde e a suite inteira passando. Este teste existe para que a
 * proxima ocorrencia falhe aqui, e nao no celular de um testador.
 */
const UI_DIR = new URL(".", import.meta.url).pathname;

// Casa `width = "..."` / `height = "..."` com literal de string.
const DIMENSION_ASSIGNMENT = /\b(?:width|height)\s*=\s*"([^"$]*)"/g;

// Valores validos: numero seguido de `px` ou `%`. Vazio tambem passa: e como
// alguns controles limpam o valor.
const VALID_DIMENSION = /^(?:-?\d+(?:\.\d+)?(?:px|%))?$/;

// Casa `fontSize = NN` com numero literal. Busca por atribuicoes diretas de
// fontSize a numeros, nao strings (por ex., `fontSize = 18` em vez de `fontSize = "18px"`).
const FONTSIZE_ASSIGNMENT = /\.fontSize\s*=\s*(\d+)/g;

// Piso minimo de legibilidade em device: ~16px CSS numa tela retrato de ~412px.
// Com idealRatio ~0,57, fontSize 28 no espaco ideal vira ~16px CSS.
const MIN_FONTSIZE = 28;

const collectTsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectTsFiles(full);
    }

    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [full]
      : [];
  });

describe("unidades de dimensao do Babylon GUI", () => {
  it("nenhum controle em src/ui usa unidade invalida", () => {
    const offenders: string[] = [];
    let dimensionCount = 0;

    for (const file of collectTsFiles(UI_DIR)) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(DIMENSION_ASSIGNMENT)) {
        dimensionCount++;
        const value = match[1];

        if (!VALID_DIMENSION.test(value)) {
          offenders.push(`${file.split("/src/")[1]}: "${value}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
    expect(dimensionCount).toBeGreaterThan(0);
  });

  it("nenhum texto em src/ui tem fontSize abaixo do piso de legibilidade (exceto DiagnosticsOverlay)", () => {
    const offenders: string[] = [];
    let fontSizeCount = 0;

    for (const file of collectTsFiles(UI_DIR)) {
      // A UNICA excecao e o painel de debug: ele so existe atras de `?debug=1`,
      // e a fonte pequena e o que permite caber uma dezena de campos numa
      // coluna sem tapar o jogo.
      //
      // `DiamondCard.ts` chegou a ficar nesta lista, e nao devia: a carta
      // estava com `fontSize` 24 e o arquivo INTEIRO foi excluido da guarda
      // para o teste passar. Isso inverte o proposito de uma guarda — ela
      // passa a se ajustar ao codigo em vez de segura-lo, e leva junto todo
      // valor futuro daquele arquivo. A restricao de geometria que motivou a
      // excecao nao existia: 28 cabe com folga na carta (ver o comentario em
      // `DiamondCard.ts`). Antes de excluir um arquivo daqui, meca.
      if (file.includes("DiagnosticsOverlay.ts")) {
        continue;
      }

      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(FONTSIZE_ASSIGNMENT)) {
        fontSizeCount++;
        const size = parseInt(match[1], 10);

        if (size < MIN_FONTSIZE) {
          offenders.push(`${file.split("/src/")[1]}: fontSize = ${size}`);
        }
      }
    }

    expect(offenders).toEqual([]);
    expect(fontSizeCount).toBeGreaterThan(0);
  });

  it("reconhece 'auto' como invalido", () => {
    // Guarda do proprio guarda: se o regex parar de pegar o caso original, o
    // teste acima passaria vazio para sempre sem proteger nada.
    expect(VALID_DIMENSION.test("auto")).toBe(false);
    expect(VALID_DIMENSION.test("100px")).toBe(true);
    expect(VALID_DIMENSION.test("50%")).toBe(true);
  });
});
