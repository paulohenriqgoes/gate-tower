import { describe, expect, it } from "vitest";

import { addedSince } from "./observerLeak";

/**
 * O caso real e "quais observers o `attach` do 8th Wall acabou de registrar na
 * cena". As duas listas vem do mesmo `Observable` do Babylon em instantes
 * diferentes, entao os casos que importam sao os que essa fonte produz de
 * verdade: nada mudou, entrou um no fim, e — por causa da remocao preguicosa
 * do Babylon — o lado esquerdo pode conter item que o direito ja nao tem.
 */
describe("addedSince", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };

  it("nao acha nada quando a lista nao mudou", () => {
    expect(addedSince([a, b], [a, b])).toEqual([]);
  });

  it("acha o que entrou, preservando a ordem de chegada", () => {
    expect(addedSince([a], [a, b, c])).toEqual([b, c]);
  });

  it("ignora o que saiu do lado esquerdo em vez de contar como novidade", () => {
    // `Observable.observers` do Babylon avisa que a remocao so acontece no
    // proximo tick: o snapshot anterior pode listar um observer que o atual
    // ja nao tem. Isso nao pode virar entrada no resultado.
    expect(addedSince([a, b], [a])).toEqual([]);
  });

  it("distingue por identidade, nao por valor", () => {
    // Dois observers com o mesmo callback sao dois observers. Se a comparacao
    // fosse estrutural, o segundo passaria por "ja conhecido" e o vazamento
    // ficaria de pe justamente no caso que este modulo existe para resolver.
    const gemeo = { id: "a" };

    expect(addedSince([a], [a, gemeo])).toEqual([gemeo]);
  });

  it("devolve tudo quando nao havia nada antes", () => {
    expect(addedSince([], [a, b])).toEqual([a, b]);
  });
});
