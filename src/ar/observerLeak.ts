/**
 * O `xrCameraBehavior` do 8th Wall vaza observers de render, e este modulo
 * existe para descobrir QUAIS, para que a gente possa remove-los por ele.
 *
 * ## O vazamento, lido no bundle (`public/8thwall/xr.js`)
 *
 * `XR8.Babylonjs` sai de uma fabrica chamada UMA vez, na construcao do
 * namespace (`Babylonjs: mQ()`). Todo behavior devolvido por
 * `xrCameraBehavior()` compartilha o mesmo fechamento — e o `attach` dele faz,
 * a cada chamada:
 *
 *     Q.onBeforeRenderObservable.add(() => E && (XR8.runPreRender(...), XR8.runRender()))
 *     Q.onAfterRenderObservable.add(() => E && XR8.runPostRender())
 *
 * O `detach` correspondente e so `XR8.stop()` + `XR8.clearCameraPipelineModules()`:
 * ele NAO remove nenhum dos dois observers. Como `Q` e sempre a mesma `Scene`,
 * a enesima sessao de RA dirige o pipeline do engine N vezes por frame, com o
 * process-gpu e a liberacao de textura rodando so uma vez — um estado que a
 * contabilidade de frames do engine nao suporta.
 *
 * Como o `add` do 8th Wall e anonimo (o `Observer` devolvido e descartado), a
 * unica forma de alcancar esses observers e comparar a lista antes e depois do
 * `attach`. E o que `addedSince` faz.
 */

/**
 * Itens que aparecem em `after` e nao estavam em `before`, na ordem de `after`.
 *
 * A comparacao e por IDENTIDADE, nao por valor, e isso e proposital: dois
 * observers com o mesmo callback continuam sendo dois observers distintos, e
 * remover o errado deixaria o vazamento de pe.
 *
 * Tolera `before` com item que sumiu no meio do caminho — o `observers` do
 * Babylon avisa que "observers recem-removidos ainda podem aparecer na lista,
 * porque a remocao so acontece de verdade no proximo tick". Um item so a mais
 * no lado esquerdo nunca vira um falso positivo do lado direito.
 */
export function addedSince<T>(before: readonly T[], after: readonly T[]): T[] {
  const known = new Set<T>(before);

  return after.filter((item) => !known.has(item));
}
