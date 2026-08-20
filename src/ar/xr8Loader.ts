import { installBabylonGlobalsForXR8 } from "./babylonRuntimeGlobals";

/** Caminho do bundle copiado por `scripts/copy-8thwall.mjs`. */
const XR8_SCRIPT_SRC = "/8thwall/xr.js";

/**
 * Carrega o engine do 8th Wall DEPOIS de instalar `window.BABYLON`.
 *
 * ## Por que a ordem e obrigatoria
 *
 * No bundle, `XR8.Babylonjs` sai de `mQ()`, chamada na CONSTRUCAO do namespace
 * (`Babylonjs: mQ()`), e a primeira coisa que a fabrica faz e:
 *
 *     let A, g, I
 *     window.BABYLON && (A = new BABYLON.Matrix, g = new BABYLON.Quaternion,
 *                        I = new BABYLON.Vector3)
 *
 * Sem `window.BABYLON` naquele instante, `g` e `I` ficam `undefined` PARA
 * SEMPRE — nao ha segunda chance, o modulo ja foi construido. O ramo destro do
 * conversor de quaternion usa os dois (`g.copyFrom(A)`); o canhoto nao toca
 * neles, e e so por isso que o projeto (canhoto) nunca viu este bug explodir.
 *
 * Ate a spec 08 o `index.html` carregava o `xr.js` com `async` e o shim era
 * instalado dentro de `enterAR()`, muito depois. Ou seja: a ordem estava errada
 * e o projeto sobrevivia por sorte. Agora a tag e injetada por JS, aqui, e a
 * unica ordem possivel e a certa.
 *
 * `data-preload-chunks="slam"` reproduz o atributo que estava no `index.html`:
 * ele adianta o download do chunk de world tracking enquanto o menu abre.
 *
 * Chamar mais de uma vez e barato — devolve sempre a mesma promise.
 */
let pending: Promise<void> | null = null;

export function loadXR8(): Promise<void> {
  if (pending) {
    return pending;
  }

  pending = new Promise<void>((resolve, reject) => {
    if (window.XR8) {
      // Alguem ja carregou o engine por fora (uma tag no HTML que voltou, um
      // spike aberto na mesma pagina). A ordem NAO esta garantida nesse caso, e
      // e melhor dizer isso alto do que descobrir por tela preta.
      console.warn(
        "[xr8Loader] window.XR8 ja existia antes de installBabylonGlobalsForXR8(): "
        + "a ordem de carregamento nao esta garantida."
      );
      resolve();
      return;
    }

    installBabylonGlobalsForXR8();

    const settle = (): void => {
      resolve();
    };

    // O engine anuncia prontidao pelo evento `xrloaded`; o `load` da tag e a
    // rede de seguranca para o caso de o evento ja ter passado.
    window.addEventListener("xrloaded", settle, { once: true });

    const tag = document.createElement("script");
    tag.src = XR8_SCRIPT_SRC;
    tag.crossOrigin = "anonymous";
    tag.setAttribute("data-preload-chunks", "slam");
    tag.addEventListener("load", () => {
      if (window.XR8) {
        settle();
      }
    });
    tag.addEventListener("error", () => {
      reject(new Error(`Falha ao carregar ${XR8_SCRIPT_SRC}`));
    });

    document.head.appendChild(tag);
  });

  return pending;
}
