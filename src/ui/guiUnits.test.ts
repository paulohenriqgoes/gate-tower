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

    for (const file of collectTsFiles(UI_DIR)) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(DIMENSION_ASSIGNMENT)) {
        const value = match[1];

        if (!VALID_DIMENSION.test(value)) {
          offenders.push(`${file.split("/src/")[1]}: "${value}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("reconhece 'auto' como invalido", () => {
    // Guarda do proprio guarda: se o regex parar de pegar o caso original, o
    // teste acima passaria vazio para sempre sem proteger nada.
    expect(VALID_DIMENSION.test("auto")).toBe(false);
    expect(VALID_DIMENSION.test("100px")).toBe(true);
    expect(VALID_DIMENSION.test("50%")).toBe(true);
  });
});
