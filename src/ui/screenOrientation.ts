/**
 * Utilitarios de orientacao de tela. A politica passou a ser RETRATO PARA
 * TODOS OS MODOS (canvas e RA) — nao e mais por modo de jogo. E a spec da
 * demo: travar em retrato tira de escopo a rotacao no meio do caminho
 * critico, que era a causa do esticamento da cena em RA.
 *
 * Por que travar ajuda especificamente a RA: com o lock de orientacao ativo o
 * SO para de emitir `orientationchange` — o que impede justamente a troca de
 * orientacao no meio da sessao. Isso importa porque a projecao da RA vem
 * CONGELADA por frame a partir das intrinsics do WASM do 8th Wall, enquanto o
 * canvas e redimensionado pelo evento de rotacao; canvas com aspecto novo
 * contra intrinsics com aspecto velho e o que estica a cena. Sem rotacao no
 * meio da sessao, esse descompasso simplesmente nao acontece.
 *
 * Onde `screen.orientation.lock` funciona (Android/Chrome em fullscreen) o
 * lock nativo resolve; no iOS Safari, que nao implementa a API, o overlay CSS
 * de `index.html` e a unica garantia. Quem aplica a politica e o `GameFlow`.
 * Historico e hipoteses em `docs/experimentos/ra-e-paisagem.md`.
 */

export interface SafeAreaInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

// Safari (iPadOS e WebViews antigos) so expoe a API de fullscreen prefixada.
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

export function isFullscreen(): boolean {
  const doc = document as FullscreenDocument;

  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Se o navegador tem API de fullscreen. Falso no Safari do iPhone, que so
 * entrega tela cheia de verdade quando o site e adicionado a tela de inicio
 * (ver `manifest.webmanifest` e as metas `apple-mobile-web-app-*`).
 */
export function isFullscreenSupported(): boolean {
  const element = document.documentElement as FullscreenElement;

  return Boolean(element.requestFullscreen ?? element.webkitRequestFullscreen);
}

export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) {
    return true;
  }

  const element = document.documentElement as FullscreenElement;

  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen({ navigationUI: "hide" });
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    } else {
      return false;
    }
  } catch {
    return false;
  }

  return isFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) {
    return;
  }

  const doc = document as FullscreenDocument;

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Sair do fullscreen nunca deve derrubar a aplicacao.
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (isFullscreen()) {
    await exitFullscreen();
    return;
  }

  await enterImmersiveMode();
}

/**
 * Entra em tela cheia e trava em retrato. Retorna se o fullscreen foi obtido.
 * Usa o lock ESPECIFICO `"portrait-primary"`, nunca o generico `"portrait"` —
 * o generico trava na variante em que o aparelho ja estiver (se o jogador
 * abrir de cabeca para baixo, trava de cabeca para baixo). O lock de
 * orientacao e rejeitado fora de fullscreen no Android e nem existe no iOS
 * Safari — nesses casos o overlay CSS de rotacao de `index.html` assume.
 */
export async function enterImmersiveMode(): Promise<boolean> {
  const isFullscreenActive = await enterFullscreen();
  const orientation = window.screen?.orientation as LockableOrientation | undefined;

  if (orientation?.lock) {
    try {
      await orientation.lock("portrait-primary");
    } catch {
      // Sem fullscreen o lock e recusado; o overlay de rotacao cobre o caso.
    }
  }

  return isFullscreenActive;
}

/**
 * Solta a trava de orientacao e sai da tela cheia. Usado ao voltar ao menu ou
 * sair do jogo — NAO e mais o que a RA chama antes de subir a sessao: a RA
 * agora pede o MESMO lock de retrato que o modo tela (ver `enterImmersiveMode`
 * e `GameFlow.applyArOrientationPolicy`), entao nao ha mais um "destravar
 * antes de entrar em RA" no fluxo normal.
 */
export async function exitImmersiveMode(): Promise<void> {
  const orientation = window.screen?.orientation as LockableOrientation | undefined;

  try {
    orientation?.unlock?.();
  } catch {
    // Nao existe no Safari do iPhone; destravar nunca deve derrubar a RA.
  }

  await exitFullscreen();
}

/**
 * Tenta entrar no modo imersivo a cada gesto ate conseguir — fullscreen e lock
 * de orientacao so sao permitidos dentro de um gesto do usuario, e o primeiro
 * toque nem sempre e aceito. Depois do primeiro sucesso paramos de insistir:
 * quem sai da tela cheia de proposito volta pelo botao do HUD.
 *
 * Usado hoje apenas no modo canvas (`GameFlow.installImmersiveModeGestureOnce`).
 * O modo RA NAO passa por aqui: ele pede o lock de retrato de forma explicita,
 * via `await enterImmersiveMode()`, ANTES de chamar `arManager.enterAR()` —
 * nunca com a sessao ja no ar. Fullscreen/lock redimensionam o canvas e
 * reprojetam a cena; pedir isso no meio do tracking e ruido gratuito em cima
 * de algo ja sensivel (ver cabecalho do arquivo).
 */
export function installImmersiveModeOnGesture(
  target: HTMLElement,
  shouldSkip: () => boolean = () => false
): void {
  if (!isFullscreenSupported()) {
    return;
  }

  const handler = (): void => {
    // Nunca durante a RA: mesmo raciocinio do docblock acima. O engine do
    // 8th Wall recalcula a orientacao a cada frame e a entrega ao WASM junto
    // com o IMU, entao ele NAO fica preso a um valor antigo — mas entrar em
    // fullscreen com a sessao no ar redimensiona o canvas e reprojeta a cena
    // no meio do tracking. Fora da RA isso e inofensivo; durante, nao.
    if (shouldSkip()) {
      return;
    }

    void enterImmersiveMode().then((entered) => {
      if (entered) {
        target.removeEventListener("pointerdown", handler);
      }
    });
  };

  target.addEventListener("pointerdown", handler);
}

/**
 * Assina mudancas de orientacao/tamanho. Retorna a funcao de descarte.
 */
export function onOrientationChange(callback: () => void): () => void {
  const orientation = window.screen?.orientation;

  window.addEventListener("resize", callback);
  window.addEventListener("orientationchange", callback);
  // Entrar/sair de tela cheia muda o tamanho do canvas.
  document.addEventListener("fullscreenchange", callback);
  document.addEventListener("webkitfullscreenchange", callback);
  orientation?.addEventListener?.("change", callback);

  return () => {
    window.removeEventListener("resize", callback);
    window.removeEventListener("orientationchange", callback);
    document.removeEventListener("fullscreenchange", callback);
    document.removeEventListener("webkitfullscreenchange", callback);
    orientation?.removeEventListener?.("change", callback);
  };
}

/**
 * Le os insets de area segura (notch) em px CSS. Em paisagem o recorte come as
 * bordas esquerda/direita — exatamente onde ficam a barra do topo e a coluna de
 * cartas —, entao o HUD precisa compensar.
 */
export function readSafeAreaInsets(): SafeAreaInsets {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.paddingTop = "env(safe-area-inset-top, 0px)";
  probe.style.paddingRight = "env(safe-area-inset-right, 0px)";
  probe.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
  probe.style.paddingLeft = "env(safe-area-inset-left, 0px)";

  document.body.appendChild(probe);

  const computed = window.getComputedStyle(probe);
  const insets: SafeAreaInsets = {
    bottom: Number.parseFloat(computed.paddingBottom) || 0,
    left: Number.parseFloat(computed.paddingLeft) || 0,
    right: Number.parseFloat(computed.paddingRight) || 0,
    top: Number.parseFloat(computed.paddingTop) || 0,
  };

  probe.remove();

  return insets;
}
