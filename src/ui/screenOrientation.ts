/**
 * Utilitarios de orientacao de tela. O jogo e desenhado para paisagem: tentamos
 * travar a orientacao nativamente (Android/Chrome, exige fullscreen) e, onde a
 * API nao existe (iOS Safari), o overlay CSS de `index.html` pede a rotacao.
 */

export interface SafeAreaInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
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
 * Entra em tela cheia e trava em paisagem. Retorna se o fullscreen foi obtido.
 * O lock de orientacao e rejeitado fora de fullscreen no Android e nem existe
 * no iOS Safari — nesses casos o overlay de rotacao assume.
 */
export async function enterImmersiveMode(): Promise<boolean> {
  const isFullscreenActive = await enterFullscreen();
  const orientation = window.screen?.orientation as LockableOrientation | undefined;

  if (orientation?.lock) {
    try {
      await orientation.lock("landscape-primary");
    } catch {
      // Sem fullscreen o lock e recusado; o overlay de rotacao cobre o caso.
    }
  }

  return isFullscreenActive;
}

/**
 * Tenta entrar no modo imersivo a cada gesto ate conseguir — fullscreen e lock
 * de orientacao so sao permitidos dentro de um gesto do usuario, e o primeiro
 * toque nem sempre e aceito. Depois do primeiro sucesso paramos de insistir:
 * quem sai da tela cheia de proposito volta pelo botao do HUD.
 */
export function installImmersiveModeOnGesture(
  target: HTMLElement,
  shouldSkip: () => boolean = () => false
): void {
  if (!isFullscreenSupported()) {
    return;
  }

  const handler = (): void => {
    // Nunca durante a RA. O engine do 8th Wall recalcula a orientacao a cada
    // frame e a entrega ao WASM junto com o IMU, entao ele NAO fica preso a um
    // valor antigo — mas entrar em fullscreen com a sessao no ar redimensiona o
    // canvas e reprojeta a cena no meio do tracking. Fora da RA isso e
    // inofensivo; durante, e ruido gratuito em cima de um tracking ja sensivel.
    // Quem cuida disso na RA e o proprio `enterAR`, antes de subir a sessao.
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
