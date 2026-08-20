import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";

declare global {
  type XR8TrackingStatus =
    | "INITIALIZING"
    | "LIMITED"
    | "RELOCALIZING"
    | "NORMAL"
    | "NOT_AVAILABLE";

  // O engine reporta mais motivos do que os que consumimos; o `string & {}`
  // preserva o autocomplete dos conhecidos sem rejeitar os demais.
  type XR8TrackingReason = "INITIALIZING" | "UNDEFINED" | (string & {});

  /**
   * Campos que o engine entrega nos callbacks do pipeline module. A tipagem e
   * parcial de proposito: o bundle e fechado e entrega mais coisas do que as
   * que usamos, entao o index signature deixa o overlay de diagnostico
   * inspecionar o resto em device.
   */
  interface XR8PipelineEvent {
    canvas?: HTMLCanvasElement;
    canvasWidth?: number;
    canvasHeight?: number;
    framework?: { dispatchEvent: (name: string, detail?: unknown) => void };
    orientation?: number;
    video?: HTMLVideoElement;
    videoWidth?: number;
    videoHeight?: number;
    [key: string]: unknown;
  }

  interface XR8CameraPipelineModule {
    name: string;
    listeners?: { event: string; process: (event: { detail?: unknown }) => void }[];
    onAttach?: (event: XR8PipelineEvent) => void;
    onCameraStatusChange?: (event: { status: "requesting" | "hasStream" | "hasVideo" | "failed" }) => void;
    onDetach?: (event?: XR8PipelineEvent) => void;
    onException?: (error: unknown) => void;
    onRemove?: (event?: XR8PipelineEvent) => void;
    onStart?: () => void;
    onVideoSizeChange?: (event: XR8PipelineEvent) => void;
    onUpdate?: (event: {
      processCpuResult?: {
        reality?: {
          trackingStatus?: XR8TrackingStatus;
          trackingReason?: XR8TrackingReason;
        };
      };
    }) => void;
  }

  /**
   * Coaching overlay de escala absoluta (`@8thwall/coaching-overlay`, MIT). O
   * bundle se expoe sozinho em `window.CoachingOverlay` ao carregar.
   */
  interface CoachingOverlayApi {
    configure: (params: {
      animationColor?: string;
      disablePrompt?: boolean;
      promptColor?: string;
      promptText?: string;
    }) => void;
    pipelineModule: () => XR8CameraPipelineModule;
  }

  interface XR8CameraBehaviorConfig {
    allowedDevices?: unknown;
    cameraConfig?: { direction?: unknown };
    webgl2?: boolean;
  }

  interface XR8Api {
    Babylonjs: {
      xrCameraBehavior: (config?: XR8CameraBehaviorConfig, xrConfig?: Record<string, unknown>) => Behavior<Camera>;
    };
    XrConfig: {
      camera: () => { BACK: unknown; FRONT: unknown };
      device: () => { ANY: unknown; MOBILE: unknown; MOBILE_AND_HEADSETS: unknown };
    };
    XrController: {
      configure: (config: {
        enableLighting?: boolean;
        scale?: "responsive" | "absolute";
      }) => void;
      recenter: () => void;
      /**
       * Declara onde a camera COMECA na cena, e com isso onde fica o piso.
       *
       * E a primitiva de grounding do engine, e o exemplo oficial de world
       * tracking (`threejs-world-effects-example`) nao usa nenhuma outra: com
       * `origin.y` na altura do jogador, o chao real cai exatamente em `y = 0`
       * no frame zero, sem medir nada. Foi confirmado em device (2026-08-19):
       * melhor calibracao com `delta 0.00` a 1,55 m declarado.
       *
       * NAO esta na doc publica do 8th Wall e existe no bundle. `cam` aceita as
       * intrinsics (nunca usadas aqui) e `updateRecenterPoint` decide se o ponto
       * de `recenter()` acompanha a nova origem — tambem ausente da doc.
       *
       * NUNCA envie valor nao-finito: `origin` com NaN contamina o frame do
       * engine de forma permanente, sem caminho de volta sem reiniciar a sessao.
       */
      updateCameraProjectionMatrix: (params: {
        cam?: Record<string, number>;
        facing?: { w: number; x: number; y: number; z: number };
        origin?: { x: number; y: number; z: number };
        updateRecenterPoint?: boolean;
      }) => void;
    };
    XrDevice: {
      isDeviceBrowserCompatible: (config?: Record<string, unknown>) => boolean;
    };
    addCameraPipelineModule: (module: XR8CameraPipelineModule) => void;
    removeCameraPipelineModule: (moduleName: string) => void;
    /** Remove TODOS os modulos de uma vez. E o que o `detach` do behavior faz. */
    clearCameraPipelineModules: () => void;
    stop: () => void;
    /**
     * Troca o `runConfig` de uma sessao VIVA. **Nao serve para reabrir uma
     * sessao derrubada**, e essa distincao custou uma unidade inteira de
     * planejamento.
     *
     * A RA-F5 foi escrita apostando que esta era a API que consertaria a
     * segunda entrada em RA. Lido no bundle (`public/8thwall/xr.js`), ela e
     * outra coisa:
     *
     *     reconfigureSession: cfg => {
     *       if (!isInitialized) throw new Error("[XR8] Cannot reinitialize session at this time.")
     *       if (isPaused)       throw new Error("[XR8] Cannot reinitialize session while paused.")
     *       ...detach, para o session manager, Object.assign(runConfig, cfg), re-init...
     *     }
     *
     * Ou seja: depois de `XR8.stop()` ela LANCA, porque `isInitialized` ja e
     * falso. E mesmo no caminho feliz ela nao redispara `onStart` nem o
     * `onAttach` de quem ja estava anexado — ela reaproveita a sessao em vez de
     * refazer o ciclo. Serve para o que o `SessionReconfigureModule` do
     * `xrextras` faz com ela: trocar camera frontal/traseira no meio da sessao.
     *
     * Fica declarada para que ninguem precise reabrir o bundle para redescobrir
     * isso. O ciclo entra/sai deste projeto e `XR8.run()` (via o attach do
     * `xrCameraBehavior`) e `XR8.stop()` (via o detach), e o que o fazia falhar
     * na segunda vez esta em `src/ar/observerLeak.ts`.
     *
     * NAO esta na doc publica do 8th Wall.
     */
    reconfigureSession: (runConfig: Record<string, unknown>) => Promise<void>;
  }

  interface Window {
    XR8?: XR8Api;
    CoachingOverlay?: CoachingOverlayApi;
  }

  interface WindowEventMap {
    xrloaded: Event;
  }
}

export {};
