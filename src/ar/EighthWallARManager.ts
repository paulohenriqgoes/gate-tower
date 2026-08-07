import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import "@babylonjs/core/Culling/ray";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Button, Control, Ellipse, Rectangle, Slider, StackPanel, TextBlock } from "@babylonjs/gui";

import type { ArSessionController } from "./ArSessionController";
import { installBabylonGlobalsForXR8 } from "./babylonRuntimeGlobals";
import { buildSampleOffsets, fitGroundPlane, normalizeToCanvas, type GroundPlaneFit } from "./hitTestSampling";
import { attachCoachingOverlay, detachCoachingOverlay } from "./coachingOverlay";
import { playSpawnScaleIn } from "../fx/spawnAnimation";
import type { DiagnosticsOverlay } from "../ui/DiagnosticsOverlay";
import type { HudLayer } from "../ui/HudLayer";
import { exitImmersiveMode } from "../ui/screenOrientation";

const XR8_LOAD_TIMEOUT_MS = 15000;
const MAX_PLACEMENT_DISTANCE = 40;
// Teto de frames aguardando a viewport estabilizar depois do fullscreen.
const VIEWPORT_SETTLE_MAX_FRAMES = 30;

// Amostragem do hitTest para o fit de plano no momento de posicionar (Fase 2).
// Um grid em aneis ao redor do toque da uma estimativa de altura robusta a ruido.
const SAMPLE_RADIUS = 0.04;
const SAMPLE_RINGS = 2;
const SAMPLE_PER_RING = 6;
const MIN_INLIERS = 3;
// Preferir superficie detectada; FEATURE_POINT e ultimo recurso.
const HITTEST_TYPES: XR8HitTestType[] = ["DETECTED_SURFACE", "ESTIMATED_SURFACE", "FEATURE_POINT"];

// So NORMAL. Esse e o criterio oficial de "escala absoluta convergiu": o
// coaching overlay do proprio 8th Wall aparece em LIMITED+INITIALIZING e some
// em NORMAL. Ancorar antes disso produz arena com tamanho e profundidade
// errados — e LIMITED/INITIALIZING/RELOCALIZING sao onde o WASM estourava.
const HITTEST_SAFE_STATUSES: XR8TrackingStatus[] = ["NORMAL"];

// Escape para ambiente com pouca textura, onde o SLAM pode nunca chegar em
// NORMAL: depois desse tempo LIMITED tambem libera, com aviso de precisao.
const PLACEMENT_FALLBACK_MS = 30000;
const FALLBACK_STATUSES: XR8TrackingStatus[] = ["LIMITED", "NORMAL"];

const STATUS_MODULE_NAME = "gate-ar-status";

// Alvos de toque do painel de setup. O espaco ideal do HUD vale ~0.54 px CSS
// por px em celular, entao um botao precisa de ~82px aqui para chegar aos 44px
// CSS recomendados — com os 32px antigos ele virava 17px CSS e nao dava para
// acertar com o dedo.
const SETUP_PANEL_WIDTH = 320;
const SETUP_BUTTON_HEIGHT = 84;
const SETUP_BUTTON_WIDTH = 140;
const SETUP_SLIDER_HEIGHT = 56;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Gerencia o modo RA via engine 8th Wall (SLAM), substituindo a sessao WebXR.
 * O chao estimado pelo SLAM fica no plano y = 0 do mundo; posicionamento da
 * arena e cursor usam raycast contra esse plano.
 */
export class EighthWallARManager implements ArSessionController {
  public readonly onArenaPlacedObservable = new Observable<void>();
  public readonly onMatchStartRequestedObservable = new Observable<void>();
  public readonly onSessionFailedObservable = new Observable<string>();
  public readonly onAvailabilityChangedObservable = new Observable<boolean>();

  private readonly scene: Scene;
  private readonly arenaRoot: TransformNode;
  private readonly groundPlane = new Plane(0, 1, 0, 0);

  private readonly hud: HudLayer;
  private readonly diagnostics: DiagnosticsOverlay | null;
  private hitCursor: Mesh | null = null;
  private scalePanel: Rectangle | null = null;
  private scaleSlider: Slider | null = null;
  private scaleValueText: TextBlock | null = null;
  private scaleButton: Button | null = null;
  private setupButtons: StackPanel | null = null;
  private confirmScaleButton: Button | null = null;
  private isScaleToolActive = false;

  private loaderPanel: Rectangle | null = null;
  private spinnerRotator: Rectangle | null = null;
  private placePrompt: TextBlock | null = null;
  private arenaGridNode: TransformNode | null = null;

  private arCamera: FreeCamera | null = null;
  private previousCamera: Camera | null = null;
  private cameraBehavior: Behavior<Camera> | null = null;

  private isXR8Ready = false;
  private hasXR8LoadFailed = false;
  private isARSupported = false;
  private isInAR = false;
  private isEnteringAR = false;
  private hasUserPlacedArenaInXR = false;
  private nonARScale = new Vector3(1, 1, 1);
  private arenaScaleInAR = 0.05;
  private latestTrackingStatus: XR8TrackingStatus | null = null;
  private hasFallbackUnlocked = false;
  private fallbackTimeoutId: number | null = null;
  // A partida comecou: o painel de setup sai e o botao de escala da barra entra.
  private isSetupComplete = false;

  public constructor(
    scene: Scene,
    arenaRoot: TransformNode,
    hud: HudLayer,
    diagnostics: DiagnosticsOverlay | null = null
  ) {
    this.scene = scene;
    this.arenaRoot = arenaRoot;
    this.hud = hud;
    this.diagnostics = diagnostics;
  }

  /** Sessao de RA ativa ou em abertura. */
  public isSessionActive(): boolean {
    return this.isInAR || this.isEnteringAR;
  }

  /** Engine carregado e device compativel com a RA do 8th Wall. */
  public isARAvailable(): boolean {
    return this.isXR8Ready && this.isARSupported;
  }

  /**
   * Volta para a fase de posicionamento sem derrubar a sessao. Antes disso, uma
   * vez ancorada a arena so dava para refazer saindo e voltando da RA.
   */
  public repositionArena(): void {
    if (!this.isInAR) {
      return;
    }

    this.hasUserPlacedArenaInXR = false;
    this.isSetupComplete = false;
    this.arenaRoot.setEnabled(false);
    this.setScalePanelVisible(false);
    this.updateUI();
  }

  /** Encerra a fase de setup: painel de setup e coaching overlay saem de cena. */
  public completeSetup(): void {
    this.isSetupComplete = true;
    this.isScaleToolActive = false;

    // O overlay some sozinho ao chegar em NORMAL, mas o modulo continua vivo e
    // reapareceria se o tracking degradasse no meio da partida.
    const xr8 = window.XR8;
    if (xr8) {
      detachCoachingOverlay(xr8);
    }

    this.setScalePanelVisible(false);
    this.setHitCursorVisible(false);
    this.updateUI();
  }

  public initialize(): void {
    this.createBabylonToggleUI();
    this.createHitCursor();
    this.registerCursorTracking();
    this.registerTouchPlacement();
    this.waitForXR8Load();
  }

  private waitForXR8Load(): void {
    if (window.XR8) {
      this.markXR8Ready();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      this.hasXR8LoadFailed = true;
      this.updateUI();
      this.onAvailabilityChangedObservable.notifyObservers(false);
    }, XR8_LOAD_TIMEOUT_MS);

    window.addEventListener(
      "xrloaded",
      () => {
        window.clearTimeout(timeoutId);
        this.markXR8Ready();
      },
      { once: true }
    );

    this.updateUI();
  }

  private markXR8Ready(): void {
    this.isXR8Ready = true;

    try {
      this.isARSupported = window.XR8?.XrDevice.isDeviceBrowserCompatible() ?? false;
    } catch (error) {
      this.isARSupported = false;
      console.warn("[EighthWallARManager] Falha ao verificar compatibilidade do dispositivo.", error);
    }

    this.updateUI();
    this.onAvailabilityChangedObservable.notifyObservers(this.isARAvailable());
  }

  /**
   * Monta os controles de RA na barra superior esquerda do HUD compartilhado:
   * botao de escala, ao lado do contador de cogumelos. A escolha entre RA e
   * modo tela nao vive mais aqui — ela e feita na tela inicial, antes da
   * partida, porque cada modo tem politica de orientacao propria.
   */
  private createBabylonToggleUI(): void {
    this.scaleButton = Button.CreateSimpleButton("scale-btn", "⤡");
    this.scaleButton.width = "72px";
    this.scaleButton.height = "72px";
    this.scaleButton.color = "white";
    this.scaleButton.cornerRadius = 12;
    this.scaleButton.background = "#1f3a4d";
    this.scaleButton.fontSize = 32;
    this.scaleButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    this.scaleButton.onPointerClickObservable.add(() => {
      // Fora do modo RA o botao fica esmaecido e inerte (em vez de invisivel),
      // para a barra do topo nao mudar de largura a cada troca de estado.
      if (!this.isScaleButtonEnabled()) {
        return;
      }

      this.isScaleToolActive = true;
      this.setScalePanelVisible(true);
      this.updateUI();
    });

    this.hud.fillSlot("ar-scale", this.scaleButton);
    this.createScaleSliderUI();
    this.createLoaderUI();
  }

  /** O botao da barra so serve DURANTE a partida; no setup o painel ja esta aberto. */
  private isScaleButtonEnabled(): boolean {
    return this.isInAR && this.isSetupComplete && !this.isScaleToolActive;
  }

  private setScaleButtonEnabled(isEnabled: boolean): void {
    if (!this.scaleButton) {
      return;
    }

    this.scaleButton.alpha = isEnabled ? 1 : 0.35;
  }

  /**
   * Loader central (vertical/horizontal) exibido enquanto o SLAM nao esta
   * NORMAL, no lugar das mensagens do topo. Um anel estatico + um ponto que
   * orbita (rotacionado por frame) formam o spinner; um prompt central separado
   * aparece quando o tracking fica pronto para posicionar.
   */
  private createLoaderUI(): void {
    const ui = this.hud.getTexture();

    const panel = new Rectangle("ar-loader");
    panel.width = "240px";
    panel.height = "180px";
    panel.thickness = 0;
    panel.background = "transparent";
    panel.isHitTestVisible = false;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.isVisible = false;

    const ring = new Ellipse("ar-loader-ring");
    ring.width = "72px";
    ring.height = "72px";
    ring.thickness = 6;
    ring.color = "#ffffff40";
    ring.background = "transparent";
    ring.isHitTestVisible = false;
    ring.top = "-24px";
    panel.addControl(ring);

    const rotator = new Rectangle("ar-loader-rotator");
    rotator.width = "72px";
    rotator.height = "72px";
    rotator.thickness = 0;
    rotator.background = "transparent";
    rotator.isHitTestVisible = false;
    rotator.top = "-24px";

    const dot = new Ellipse("ar-loader-dot");
    dot.width = "16px";
    dot.height = "16px";
    dot.thickness = 0;
    dot.background = "#22c55e";
    dot.isHitTestVisible = false;
    dot.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    rotator.addControl(dot);
    panel.addControl(rotator);

    const label = new TextBlock("ar-loader-label", "Preparando o ambiente...\nmova o celular devagar");
    label.color = "white";
    label.fontSize = 17;
    label.height = "56px";
    label.textWrapping = true;
    label.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    label.isHitTestVisible = false;
    panel.addControl(label);

    ui.addControl(panel);
    this.loaderPanel = panel;
    this.spinnerRotator = rotator;

    const prompt = new TextBlock("ar-place-prompt", "Aponte para o chao e toque para posicionar a arena");
    prompt.color = "white";
    prompt.fontSize = 20;
    prompt.textWrapping = true;
    prompt.width = "78%";
    prompt.height = "70px";
    prompt.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    prompt.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    prompt.isHitTestVisible = false;
    prompt.isVisible = false;
    ui.addControl(prompt);
    this.placePrompt = prompt;

    this.scene.onBeforeRenderObservable.add(() => {
      if (this.spinnerRotator && this.loaderPanel?.isVisible) {
        this.spinnerRotator.rotation += 0.09;
      }
    });
  }

  /**
   * Sincroniza o overlay central com o estado de posicionamento:
   * - sessao subindo, sem `trackingStatus` ainda → loader girando;
   * - calibrando (o engine ja reporta status) → quem fala e o coaching overlay
   *   oficial do 8th Wall, entao o loader sai de cena para nao competir;
   * - pronto (calibrado, ainda nao posicionado) → prompt "aponte e toque";
   * - fora disso → nada, e o texto do topo volta a valer.
   */
  private refreshPlacementOverlay(): void {
    const inPlacement = this.isInAR && !this.hasUserPlacedArenaInXR;
    const ready = inPlacement && this.isTrackingReady();
    // So enquanto o engine nao reportou nada: a partir dai a calibracao e
    // comunicada pelo coaching overlay, e dois indicadores girando confundem.
    const waiting = inPlacement && !ready && this.latestTrackingStatus === null;

    if (this.loaderPanel) {
      this.loaderPanel.isVisible = waiting;
    }

    if (this.placePrompt) {
      this.placePrompt.isVisible = ready;
    }

    this.hud.setArStatusVisible(!inPlacement);
  }

  private createScaleSliderUI(): void {
    const ui = this.hud.getTexture();

    const panel = new Rectangle("arena-scale-panel");
    panel.width = `${SETUP_PANEL_WIDTH}px`;
    // O StackPanel ignora filhos invisiveis, entao a altura acomoda a linha de
    // botoes de setup e o painel encolhe sozinho durante a partida.
    panel.adaptHeightToChildren = true;
    panel.cornerRadius = 12;
    panel.color = "#4b5563";
    panel.thickness = 1;
    panel.background = "#111827d9";
    // Inferior-esquerdo: em paisagem o topo-direito e a lateral direita ficam
    // ocupados pela coluna de cartas.
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.left = "22px";
    panel.top = "-22px";
    panel.isVisible = false;

    const stack = new StackPanel("arena-scale-stack");
    stack.isVertical = true;
    stack.paddingTop = "10px";
    stack.paddingLeft = "12px";
    stack.paddingRight = "12px";
    stack.paddingBottom = "10px";

    const title = new TextBlock("arena-scale-title", "Escala da arena");
    title.height = "34px";
    title.color = "white";
    title.fontSize = 22;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const slider = new Slider("arena-scale-slider");
    slider.minimum = 0.005;
    slider.maximum = 0.100;
    slider.value = this.arenaScaleInAR;
    slider.height = `${SETUP_SLIDER_HEIGHT}px`;
    slider.width = "100%";
    slider.background = "#374151";
    slider.color = "#22c55e";

    const valueText = new TextBlock("arena-scale-value", `Escala: ${this.arenaScaleInAR.toFixed(3)}`);
    valueText.height = "30px";
    valueText.color = "#d1d5db";
    valueText.fontSize = 19;
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    slider.onValueChangedObservable.add((value) => {
      this.arenaScaleInAR = Number(value.toFixed(3));
      valueText.text = `Escala: ${this.arenaScaleInAR.toFixed(3)}`;

      if (this.isInAR && this.hasUserPlacedArenaInXR) {
        this.applyArenaScale(this.arenaScaleInAR);
      }
    });

    // Confirma o ajuste de escala feito DURANTE a partida (painel aberto pelo
    // botao da barra). Na fase de setup quem confirma e "Comecar".
    const okButton = this.createPanelButton("scale-ok-btn", "✓ OK", "#22c55e");

    okButton.onPointerClickObservable.add(() => {
      this.isScaleToolActive = false;
      this.setScalePanelVisible(false);
      this.updateUI();
    });

    // Par de botoes exclusivo da fase de setup.
    const setupButtons = new StackPanel("arena-setup-buttons");
    setupButtons.isVertical = false;
    setupButtons.height = `${SETUP_BUTTON_HEIGHT}px`;
    setupButtons.spacing = 12;

    const repositionButton = this.createPanelButton("reposition-btn", "Reposicionar", "#1f3a4d");
    repositionButton.onPointerClickObservable.add(() => {
      this.repositionArena();
    });

    const startButton = this.createPanelButton("start-match-btn", "Comecar", "#22c55e");
    startButton.onPointerClickObservable.add(() => {
      // Quem transiciona a fase e o GameFlow; aqui so avisamos.
      this.onMatchStartRequestedObservable.notifyObservers();
    });

    setupButtons.addControl(repositionButton);
    setupButtons.addControl(startButton);

    stack.addControl(title);
    stack.addControl(slider);
    stack.addControl(valueText);
    stack.addControl(okButton);
    stack.addControl(setupButtons);
    panel.addControl(stack);
    ui.addControl(panel);

    this.scalePanel = panel;
    this.scaleSlider = slider;
    this.scaleValueText = valueText;
    this.setupButtons = setupButtons;
    this.confirmScaleButton = okButton;
  }

  private createPanelButton(name: string, label: string, background: string): Button {
    const button = Button.CreateSimpleButton(name, label);
    button.width = `${SETUP_BUTTON_WIDTH}px`;
    button.height = `${SETUP_BUTTON_HEIGHT}px`;
    button.color = "white";
    button.cornerRadius = 10;
    button.background = background;
    button.fontSize = 20;

    return button;
  }

  private createHitCursor(): void {
    const cursor = MeshBuilder.CreateTorus(
      "hit-cursor",
      {
        diameter: 0.35,
        thickness: 0.02
      },
      this.scene
    );

    const cursorMaterial = new StandardMaterial("hit-cursor-material", this.scene);
    cursorMaterial.diffuseColor = Color3.FromHexString("#16a34a");
    cursorMaterial.emissiveColor = Color3.FromHexString("#22c55e");
    cursor.material = cursorMaterial;
    cursor.isPickable = false;
    cursor.isVisible = false;

    this.hitCursor = cursor;
  }

  private registerCursorTracking(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      if (!this.isInAR || this.hasUserPlacedArenaInXR || !this.hitCursor) {
        return;
      }

      // O reticle so aparece com tracking NORMAL — antes disso o loader central
      // e quem comunica a espera.
      if (!this.isTrackingReady()) {
        this.setHitCursorVisible(false);
        return;
      }

      const previewPoint = this.previewGroundPoint();

      if (!previewPoint) {
        this.setHitCursorVisible(false);
        return;
      }

      this.hitCursor.position.copyFrom(previewPoint);
      this.hitCursor.rotationQuaternion = null;
      this.hitCursor.rotation.set(0, 0, 0);
      this.setHitCursorVisible(true);
    });
  }

  /**
   * Ponto de preview do cursor: um unico hitTest no centro da tela (barato, 1x
   * por frame). Se o engine nao devolver superficie, cai no plano y=0 apenas
   * como feedback visual — NUNCA e usado para posicionar de fato a arena.
   */
  private previewGroundPoint(): Vector3 | null {
    const xr8 = window.XR8;

    // So consulta o hitTest com SLAM rastreando (NORMAL). Chamar antes disso
    // estoura o WASM do xr-slam ("memory access out of bounds").
    if (xr8 && this.isTrackingReady()) {
      const results = this.safeHitTest(xr8, 0.5, 0.5);

      if (results.length > 0) {
        const { position } = results[0];
        return new Vector3(position.x, position.y, position.z);
      }
    }

    const engine = this.scene.getEngine();
    return this.pickGroundPoint(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);
  }

  /**
   * Envolve XR8.XrController.hitTest em try/catch. Mesmo com o gate de tracking,
   * o WASM do SLAM pode lancar (RuntimeError) em janelas de relocalizacao — e um
   * throw dentro do render loop mataria a aplicacao inteira.
   */
  private safeHitTest(xr8: XR8Api, x: number, y: number): XR8HitTestResult[] {
    try {
      return xr8.XrController.hitTest(x, y, HITTEST_TYPES);
    } catch (error) {
      console.warn("[EighthWallARManager] hitTest falhou (SLAM instavel).", error);
      return [];
    }
  }

  private registerTouchPlacement(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
        return;
      }

      if (!this.isInAR || this.hasUserPlacedArenaInXR) {
        return;
      }

      if (!this.isTrackingReady()) {
        // O loader central ja comunica a espera; nada a fazer no toque.
        return;
      }

      const fit = this.sampleGroundFit(this.scene.pointerX, this.scene.pointerY);

      if (!fit) {
        this.updateUI("Procure uma superficie e toque novamente", true);
        return;
      }

      // Ancora na profundidade real do piso (fit.position) e TRAVA — sem
      // reancoragem continua. Isso corrige o item 2 (arena escorregando ao
      // aproximar o celular por causa de profundidade errada do plano y=0).
      this.applyPlacement(fit);
      this.arenaRoot.setEnabled(true);
      // A arena surge crescendo a partir da ancora, em vez de aparecer inteira.
      playSpawnScaleIn(this.arenaRoot, this.scene);
      this.hasUserPlacedArenaInXR = true;
      this.clearPlacementFallbackTimer();
      this.setHitCursorVisible(false);
      this.updateUI();
      this.onArenaPlacedObservable.notifyObservers();
    });
  }

  /**
   * Dispara um grid de hitTests (aneis ao redor do toque) e faz o fit robusto de
   * um plano para estimar a profundidade real do piso. Coordenadas de tela em px
   * CSS sao normalizadas por clientWidth/clientHeight (NUNCA getRenderWidth).
   */
  private sampleGroundFit(screenX: number, screenY: number): GroundPlaneFit | null {
    const xr8 = window.XR8;
    const canvas = this.scene.getEngine().getRenderingCanvas();

    if (!xr8 || !canvas) {
      return null;
    }

    const base = normalizeToCanvas(screenX, screenY, canvas);
    const offsets = buildSampleOffsets(SAMPLE_RADIUS, SAMPLE_RINGS, SAMPLE_PER_RING);
    const points: Vector3[] = [];

    for (const { dx, dy } of offsets) {
      const sampleX = clamp01(base.x + dx);
      const sampleY = clamp01(base.y + dy);
      const results = this.safeHitTest(xr8, sampleX, sampleY);

      if (results.length > 0) {
        const { position } = results[0];
        points.push(new Vector3(position.x, position.y, position.z));
      }
    }

    return fitGroundPlane(points, MIN_INLIERS);
  }

  /**
   * Gate de posicionamento por qualidade de tracking. Status desconhecido (null)
   * NAO bloqueia — o engine pode nao reportar; so bloqueamos quando o SLAM diz
   * explicitamente que ainda nao esta pronto (INITIALIZING/RELOCALIZING/etc).
   */
  private isTrackingReady(): boolean {
    if (this.latestTrackingStatus === null) {
      return false;
    }

    const allowed = this.hasFallbackUnlocked ? FALLBACK_STATUSES : HITTEST_SAFE_STATUSES;

    return allowed.includes(this.latestTrackingStatus);
  }

  /**
   * Arma o escape de posicionamento. Sem ele, um ambiente com pouca textura
   * (parede lisa, pouca luz) pode nunca chegar em NORMAL e prender o jogador no
   * coaching overlay sem conseguir jogar em RA.
   */
  private startPlacementFallbackTimer(): void {
    this.clearPlacementFallbackTimer();

    this.fallbackTimeoutId = window.setTimeout(() => {
      this.fallbackTimeoutId = null;
      this.hasFallbackUnlocked = true;
      this.updateUI();
    }, PLACEMENT_FALLBACK_MS);
  }

  private clearPlacementFallbackTimer(): void {
    if (this.fallbackTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.fallbackTimeoutId);
    this.fallbackTimeoutId = null;
  }

  /** Texto de status na tela (o celular nao tem console acessivel). */
  private trackingHintText(): string {
    const status = this.latestTrackingStatus ?? "iniciando";

    if (!this.isTrackingReady()) {
      return `Tracking: ${status} | mova o celular p/ frente e p/ tras`;
    }

    return status === "NORMAL"
      ? `Tracking: ${status} | aponte pro chao e toque`
      : `Tracking: ${status} | da pra posicionar, mas a precisao pode cair`;
  }

  /** Liga/desliga o grid xadrez da arena (agrupado sob o no "arena-grid"). */
  private setArenaGridVisible(visible: boolean): void {
    if (!this.arenaGridNode) {
      this.arenaGridNode = this.scene.getTransformNodeByName("arena-grid");
    }

    this.arenaGridNode?.setEnabled(visible);
  }

  private pickGroundPoint(screenX: number, screenY: number): Vector3 | null {
    if (!this.arCamera) {
      return null;
    }

    const ray = this.scene.createPickingRay(screenX, screenY, Matrix.Identity(), this.arCamera);
    const distance = ray.intersectsPlane(this.groundPlane);

    if (distance === null || distance < 0 || distance > MAX_PLACEMENT_DISTANCE) {
      return null;
    }

    return ray.origin.add(ray.direction.scale(distance));
  }

  public async enterAR(): Promise<void> {
    if (this.isEnteringAR || this.isInAR) {
      return;
    }

    const xr8 = window.XR8;

    if (!this.isARAvailable() || !xr8) {
      this.updateUI("RA indisponivel", true);
      this.onSessionFailedObservable.notifyObservers("RA indisponivel neste aparelho");
      return;
    }

    this.isEnteringAR = true;
    this.updateUI("Iniciando RA...", false);

    try {
      await this.requestMotionPermission();

      // Sai da tela cheia e destrava a orientacao ANTES de subir a sessao. Em
      // paisagem travada o tracking fica inutilizavel no device, e com o lock
      // ativo o SO para de emitir `orientationchange` — o engine recalcula
      // `orientation` a cada frame e entrega ao WASM, entao um lock silencioso
      // desalinha o IMU da pose fisica real. Mexer nisso com a sessao no ar
      // tambem redimensiona o canvas e reprojeta a cena no meio do tracking.
      await exitImmersiveMode();
      await this.waitForStableViewport();

      installBabylonGlobalsForXR8();
      xr8.XrController.configure({ scale: "absolute" });
      xr8.addCameraPipelineModule(this.createStatusPipelineModule());
      // Guia o jogador a mover o celular ate a escala absoluta convergir; ele
      // some sozinho quando o tracking chega em NORMAL.
      attachCoachingOverlay(xr8);

      this.nonARScale.copyFrom(this.arenaRoot.scaling);
      this.applyArenaScale(this.arenaScaleInAR);
      this.arenaRoot.setEnabled(false);
      this.hasUserPlacedArenaInXR = false;
      this.isSetupComplete = false;
      this.latestTrackingStatus = null;
      this.hasFallbackUnlocked = false;
      this.startPlacementFallbackTimer();
      this.isScaleToolActive = false;
      // Em RA o grid xadrez denuncia o plano flutuante — escondido; ficam so
      // torres/unidades + sombras de contato no piso real.
      this.setArenaGridVisible(false);
      this.setHitCursorVisible(false);
      this.setScalePanelVisible(false);

      this.previousCamera = this.scene.activeCamera;
      this.previousCamera?.detachControl();

      this.arCamera = new FreeCamera("ar-camera", new Vector3(0, 2, 0), this.scene);
      this.arCamera.minZ = 0.01;
      this.arCamera.maxZ = 1000;
      this.scene.activeCamera = this.arCamera;

      this.cameraBehavior = xr8.Babylonjs.xrCameraBehavior({
        cameraConfig: { direction: xr8.XrConfig.camera().BACK },
      });
      this.arCamera.addBehavior(this.cameraBehavior, true);

      this.isInAR = true;
      this.updateUI();
    } catch (error) {
      console.error("[EighthWallARManager] Falha ao iniciar RA.", error);
      this.exitAR();
      this.updateUI("Falha ao iniciar RA", true);
      this.onSessionFailedObservable.notifyObservers("Falha ao iniciar a RA");
    } finally {
      this.isEnteringAR = false;
    }
  }

  public exitAR(): void {
    // Os modulos eram adicionados a cada `enterAR` e nunca removidos: entrar,
    // sair e entrar de novo empilhava uma instancia nova por vez.
    const xr8 = window.XR8;
    if (xr8) {
      try {
        xr8.removeCameraPipelineModule(STATUS_MODULE_NAME);
      } catch (error) {
        console.warn("[EighthWallARManager] Falha ao remover o modulo de status.", error);
      }

      detachCoachingOverlay(xr8);
    }

    this.clearPlacementFallbackTimer();

    if (this.arCamera && this.cameraBehavior) {
      this.arCamera.removeBehavior(this.cameraBehavior);
    }

    this.cameraBehavior = null;

    if (this.arCamera) {
      this.arCamera.dispose();
      this.arCamera = null;
    }

    // O attach do behavior desliga o autoClear para desenhar o feed da camera.
    this.scene.autoClear = true;

    if (this.previousCamera) {
      this.scene.activeCamera = this.previousCamera;
      this.previousCamera.attachControl(true);
      this.previousCamera = null;
    }

    this.isInAR = false;
    this.hasUserPlacedArenaInXR = false;
    this.isSetupComplete = false;
    this.hasFallbackUnlocked = false;
    this.isScaleToolActive = false;
    this.setHitCursorVisible(false);
    this.setScalePanelVisible(false);

    this.arenaRoot.setEnabled(true);
    this.arenaRoot.position.set(0, 0, 0);
    this.arenaRoot.rotationQuaternion = null;
    this.arenaRoot.rotation.set(0, 0, 0);
    this.arenaRoot.scaling.copyFrom(this.nonARScale);
    this.setArenaGridVisible(true);

    this.updateUI();
  }

  private createStatusPipelineModule(): XR8CameraPipelineModule {
    let hasDumpedEventKeys = false;

    return {
      name: STATUS_MODULE_NAME,
      onAttach: (event) => {
        this.reportVideoSize(event);

        if (hasDumpedEventKeys) {
          return;
        }

        hasDumpedEventKeys = true;
        // O bundle do engine e fechado e nossa tipagem dos callbacks e parcial;
        // este dump em tela e o que permite tipar o resto a partir do que ele
        // realmente entrega, em vez de assumir nomes.
        this.diagnostics?.setField("eventKeys", Object.keys(event).join(","));
      },
      onVideoSizeChange: (event) => {
        this.reportVideoSize(event);
      },
      onUpdate: (event) => {
        const status = event?.processCpuResult?.reality?.trackingStatus;
        const reason = event?.processCpuResult?.reality?.trackingReason;

        this.diagnostics?.setFields({
          trackingStatus: status ?? "n/a",
          trackingReason: reason ?? "n/a",
        });

        if (!status || status === this.latestTrackingStatus) {
          return;
        }

        console.info(`[EighthWallARManager] trackingStatus: ${status}`);
        this.latestTrackingStatus = status;

        // Reflete o status na tela (celular nao tem console acessivel).
        if (this.isInAR) {
          this.updateUI();
        }
      },
      onCameraStatusChange: ({ status }) => {
        if (status !== "failed") {
          return;
        }

        // Sai fora do callback do pipeline para nao parar o XR8 durante o proprio tick.
        window.setTimeout(() => {
          this.exitAR();
          this.updateUI("Permissao de camera negada", true);
          this.onSessionFailedObservable.notifyObservers("Permissao de camera negada");
        }, 0);
      },
      onException: (error) => {
        console.error("[EighthWallARManager] Erro no engine 8th Wall.", error);

        window.setTimeout(() => {
          this.exitAR();
          this.updateUI("Falha ao iniciar RA", true);
          this.onSessionFailedObservable.notifyObservers("A sessao de RA caiu");
        }, 0);
      },
    };
  }

  /**
   * O aspect do video contra o do canvas e a medida que decide se a hipotese do
   * `pixelRect` das intrinsics explica o tracking quebrado em paisagem.
   */
  private reportVideoSize(event: XR8PipelineEvent): void {
    const { videoWidth, videoHeight } = event;

    if (!this.diagnostics || !videoWidth || !videoHeight) {
      return;
    }

    this.diagnostics.setFields({
      videoSize: `${videoWidth}x${videoHeight}`,
      videoAspect: (videoWidth / videoHeight).toFixed(2),
    });
  }

  /**
   * Espera a viewport parar de mudar antes de subir a sessao. Entrar em tela
   * cheia e travar a orientacao redimensionam a tela de forma assincrona, e o
   * engine so fotografa canvas e orientacao no momento do init.
   */
  private async waitForStableViewport(): Promise<void> {
    let lastWidth = -1;
    let lastHeight = -1;

    for (let frame = 0; frame < VIEWPORT_SETTLE_MAX_FRAMES; frame += 1) {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      const { innerHeight, innerWidth } = window;

      if (innerWidth === lastWidth && innerHeight === lastHeight) {
        return;
      }

      lastWidth = innerWidth;
      lastHeight = innerHeight;
    }
  }

  /** iOS 13+ exige permissao explicita de sensores de movimento dentro de um gesto do usuario. */
  private async requestMotionPermission(): Promise<void> {
    const motionEvent =
      typeof DeviceMotionEvent !== "undefined"
        ? (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        : null;

    if (!motionEvent?.requestPermission) {
      return;
    }

    try {
      const result = await motionEvent.requestPermission();

      if (result !== "granted") {
        throw new Error("Permissao de sensores de movimento negada.");
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private applyPlacement(fit: GroundPlaneFit): void {
    const groundPoint = fit.position;

    // Alinha o eixo +Z da arena com a direcao horizontal da camera: torres
    // azuis (lado do jogador) ficam mais proximas de quem posicionou.
    const forward = this.arCamera
      ? this.arCamera.getDirection(Vector3.Forward())
      : Vector3.Forward();
    const yaw = Math.atan2(forward.x, forward.z);
    const yawRotation = Quaternion.FromEulerAngles(0, yaw, 0);

    // Alinha o "up" da arena a normal REAL do piso medida no fit, para ela
    // assentar plana no chao. A world-up do SLAM as vezes nao bate com o piso,
    // o que dava a sensacao de um lado (vermelho) levemente inclinado pra cima.
    const rotation = this.buildGroundAlignedRotation(fit.normal, yawRotation);

    this.arenaRoot.rotationQuaternion = rotation;
    this.applyArenaScale(this.arenaScaleInAR);

    // O toque NAO ancora o centro da arena, e sim as "costas" das torres azuis
    // (a borda do lado do jogador). Deslocamos a arena para que esse ponto local
    // caia exatamente no ponto tocado — o campo se estende para frente.
    const anchorLocal = this.getPlacementAnchorLocal().scale(this.arenaScaleInAR);
    const worldOffset = Vector3.Zero();
    anchorLocal.rotateByQuaternionToRef(rotation, worldOffset);

    this.arenaRoot.position.copyFrom(groundPoint.subtract(worldOffset));
  }

  /**
   * Ponto local da arena a ser ancorado no toque: as costas (lado do jogador) da
   * fileira de torres azuis. Derivado das proprias torres (`tower-blue-*`) para
   * nao hardcodar o layout do ArenaSystem.
   */
  private getPlacementAnchorLocal(): Vector3 {
    const blueTowers = this.arenaRoot.getChildMeshes(
      true,
      (node) => node.name.startsWith("tower-blue")
    );

    if (blueTowers.length === 0) {
      return Vector3.Zero();
    }

    let minZ = Number.POSITIVE_INFINITY;
    for (const tower of blueTowers) {
      minZ = Math.min(minZ, tower.position.z);
    }

    // Recuo pelo raio da torre (diameter 1.6) para chegar atras dela.
    const TOWER_RADIUS = 0.8;
    return new Vector3(0, 0, minZ - TOWER_RADIUS);
  }

  /**
   * Compoe a rotacao final: primeiro o yaw (direcao), depois inclina o "up" da
   * arena ate a normal medida do piso. Rejeita normais muito fora da vertical
   * (ruido do fit): acima de MAX_TILT mantem nivelado, evitando tombar a arena.
   */
  private buildGroundAlignedRotation(normal: Vector3, yawRotation: Quaternion): Quaternion {
    const MAX_TILT_RAD = (12 * Math.PI) / 180;
    const up = Vector3.Up();

    if (normal.lengthSquared() < 1e-6) {
      return yawRotation;
    }

    const n = normal.normalizeToNew();
    const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(up, n))));

    if (!Number.isFinite(angle) || angle > MAX_TILT_RAD) {
      return yawRotation;
    }

    const tilt = new Quaternion();
    Quaternion.FromUnitVectorsToRef(up, n, tilt);

    // tilt * yaw = aplica o yaw primeiro (em torno do up), depois inclina.
    return tilt.multiply(yawRotation);
  }

  private setHitCursorVisible(value: boolean): void {
    if (!this.hitCursor) {
      return;
    }

    this.hitCursor.isVisible = value;
  }

  /**
   * O painel tem dois modos: na fase de setup traz "Reposicionar"/"Comecar";
   * durante a partida (aberto pelo botao da barra) traz so o "OK" da escala.
   */
  private setScalePanelVisible(value: boolean): void {
    if (!this.scalePanel) {
      return;
    }

    this.scalePanel.isVisible = value;

    const isSetupMode = value && !this.isSetupComplete;

    if (this.setupButtons) {
      // So depois de ancorar: "Comecar" antes disso iniciaria a partida sem
      // arena no mundo, e nao ha nada para "Reposicionar".
      this.setupButtons.isVisible = isSetupMode && this.hasUserPlacedArenaInXR;
    }

    if (this.confirmScaleButton) {
      this.confirmScaleButton.isVisible = value && !isSetupMode;
    }

    if (this.scaleSlider && this.scaleValueText) {
      this.scaleSlider.value = this.arenaScaleInAR;
      this.scaleValueText.text = `Escala: ${this.arenaScaleInAR.toFixed(3)}`;
    }
  }

  private applyArenaScale(value: number): void {
    this.arenaRoot.scaling.setAll(value);
  }

  private updateUI(customLabel?: string, warning = false): void {
    // Guard de "UI ja montada": antes do `initialize()` nao ha o que atualizar.
    if (!this.scaleButton) {
      return;
    }

    this.refreshPlacementOverlay();
    this.setScaleButtonEnabled(this.isScaleButtonEnabled());

    if (customLabel) {
      this.hud.setArStatusVisible(true);
      this.hud.setArStatus(customLabel, warning);
      return;
    }

    if (!this.isXR8Ready) {
      this.hud.setArStatus(this.hasXR8LoadFailed ? "RA indisponivel" : "Carregando RA...");
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.isARSupported) {
      this.hud.setArStatus("RA indisponivel");
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.isInAR) {
      this.hud.setArStatus("RA: Off");
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.hasUserPlacedArenaInXR) {
      // Arena ainda nao ancorada: da para pre-ajustar a escala enquanto o
      // coaching overlay pede o movimento de calibracao.
      this.setScalePanelVisible(true);
      this.hud.setArStatus(this.trackingHintText(), this.hasFallbackUnlocked);
      return;
    }

    if (!this.isSetupComplete) {
      this.setScalePanelVisible(true);
      this.hud.setArStatus("RA: On | Ajuste a escala ou toque em Comecar");
      return;
    }

    if (this.isScaleToolActive) {
      this.setScalePanelVisible(true);
      this.hud.setArStatus("RA: On | Ajuste a escala da arena");
      return;
    }

    this.setScalePanelVisible(false);
    this.hud.setArStatus("RA: On | Arena posicionada");
  }
}
