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
import type { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture, Button, Control, Ellipse, Rectangle, Slider, StackPanel, TextBlock } from "@babylonjs/gui";

import { installBabylonGlobalsForXR8 } from "./babylonRuntimeGlobals";
import { buildSampleOffsets, fitGroundPlane, normalizeToCanvas, type GroundPlaneFit } from "./hitTestSampling";
import { playSpawnScaleIn } from "../fx/spawnAnimation";

const XR8_LOAD_TIMEOUT_MS = 15000;
const MAX_PLACEMENT_DISTANCE = 40;

// Amostragem do hitTest para o fit de plano no momento de posicionar (Fase 2).
// Um grid em aneis ao redor do toque da uma estimativa de altura robusta a ruido.
const SAMPLE_RADIUS = 0.06;
const SAMPLE_RINGS = 2;
const SAMPLE_PER_RING = 6;
const MIN_INLIERS = 3;
// Preferir superficie detectada; FEATURE_POINT e ultimo recurso.
const HITTEST_TYPES: XR8HitTestType[] = ["DETECTED_SURFACE", "ESTIMATED_SURFACE", "FEATURE_POINT"];

// So NORMAL: em device o LIMITED deixou o tracking instavel demais ao posicionar.
// Os demais (INITIALIZING/RELOCALIZING/null) tambem sao onde o WASM estourava.
const HITTEST_SAFE_STATUSES: XR8TrackingStatus[] = ["NORMAL"];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Gerencia o modo RA via engine 8th Wall (SLAM), substituindo a sessao WebXR.
 * O chao estimado pelo SLAM fica no plano y = 0 do mundo; posicionamento da
 * arena e cursor usam raycast contra esse plano.
 */
export class EighthWallARManager {
  private readonly scene: Scene;
  private readonly arenaRoot: TransformNode;
  private readonly groundPlane = new Plane(0, 1, 0, 0);

  private ui: AdvancedDynamicTexture | null = null;
  private toggleButton: Button | null = null;
  private statusText: TextBlock | null = null;
  private hitCursor: Mesh | null = null;
  private scalePanel: Rectangle | null = null;
  private scaleSlider: Slider | null = null;
  private scaleValueText: TextBlock | null = null;
  private scaleButton: Button | null = null;
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
  private arenaScaleInAR = 0.02;
  private latestTrackingStatus: XR8TrackingStatus | null = null;

  public constructor(scene: Scene, arenaRoot: TransformNode) {
    this.scene = scene;
    this.arenaRoot = arenaRoot;
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
  }

  private createBabylonToggleUI(): void {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI("xr-ui", true, this.scene);

    this.toggleButton = Button.CreateSimpleButton("toggle-ra", "Alternar RA");
    this.toggleButton.width = "220px";
    this.toggleButton.height = "60px";
    this.toggleButton.color = "white";
    this.toggleButton.cornerRadius = 12;
    this.toggleButton.background = "#1f3a4d";
    this.toggleButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.toggleButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.toggleButton.top = "20px";
    this.toggleButton.left = "-20px";

    this.statusText = new TextBlock("ra-status", "RA: Off");
    this.statusText.color = "white";
    this.statusText.fontSize = 20;
    this.statusText.height = "40px";
    this.statusText.top = "92px";
    this.statusText.left = "-20px";
    this.statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    this.toggleButton.onPointerClickObservable.add(() => {
      void this.toggleAR();
    });

    this.scaleButton = Button.CreateSimpleButton("scale-btn", "⤡");
    this.scaleButton.width = "60px";
    this.scaleButton.height = "60px";
    this.scaleButton.color = "white";
    this.scaleButton.cornerRadius = 12;
    this.scaleButton.background = "#1f3a4d";
    this.scaleButton.fontSize = 28;
    this.scaleButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.scaleButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scaleButton.top = "20px";
    this.scaleButton.left = "-250px";
    this.scaleButton.isVisible = false;

    this.scaleButton.onPointerClickObservable.add(() => {
      this.isScaleToolActive = true;
      this.setScalePanelVisible(true);
      this.updateUI();
    });

    this.ui.addControl(this.toggleButton);
    this.ui.addControl(this.scaleButton);
    this.ui.addControl(this.statusText);
    this.createScaleSliderUI();
    this.createLoaderUI();
  }

  /**
   * Loader central (vertical/horizontal) exibido enquanto o SLAM nao esta
   * NORMAL, no lugar das mensagens do topo. Um anel estatico + um ponto que
   * orbita (rotacionado por frame) formam o spinner; um prompt central separado
   * aparece quando o tracking fica pronto para posicionar.
   */
  private createLoaderUI(): void {
    if (!this.ui) {
      return;
    }

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

    this.ui.addControl(panel);
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
    this.ui.addControl(prompt);
    this.placePrompt = prompt;

    this.scene.onBeforeRenderObservable.add(() => {
      if (this.spinnerRotator && this.loaderPanel?.isVisible) {
        this.spinnerRotator.rotation += 0.09;
      }
    });
  }

  /**
   * Sincroniza o overlay central com o estado de posicionamento:
   * - esperando tracking (nao NORMAL) → loader girando;
   * - pronto (NORMAL, ainda nao posicionado) → prompt "aponte e toque";
   * - fora disso → nada, e o texto do topo volta a valer.
   */
  private refreshPlacementOverlay(): void {
    const inPlacement = this.isInAR && !this.hasUserPlacedArenaInXR;
    const ready = inPlacement && this.isTrackingReady();
    const waiting = inPlacement && !ready;

    if (this.loaderPanel) {
      this.loaderPanel.isVisible = waiting;
    }

    if (this.placePrompt) {
      this.placePrompt.isVisible = ready;
    }

    if (this.statusText) {
      this.statusText.isVisible = !inPlacement;
    }
  }

  private createScaleSliderUI(): void {
    if (!this.ui) {
      return;
    }

    const panel = new Rectangle("arena-scale-panel");
    panel.width = "260px";
    panel.height = "160px";
    panel.cornerRadius = 12;
    panel.color = "#4b5563";
    panel.thickness = 1;
    panel.background = "#111827d9";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.left = "-20px";
    panel.top = "20px";
    panel.isVisible = false;

    const stack = new StackPanel("arena-scale-stack");
    stack.isVertical = true;
    stack.paddingTop = "10px";
    stack.paddingLeft = "12px";
    stack.paddingRight = "12px";
    stack.paddingBottom = "10px";

    const title = new TextBlock("arena-scale-title", "Escala da arena");
    title.height = "26px";
    title.color = "white";
    title.fontSize = 18;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const slider = new Slider("arena-scale-slider");
    slider.minimum = 0.005;
    slider.maximum = 0.100;
    slider.value = this.arenaScaleInAR;
    slider.height = "20px";
    slider.width = "100%";
    slider.background = "#374151";
    slider.color = "#22c55e";

    const valueText = new TextBlock("arena-scale-value", `Escala: ${this.arenaScaleInAR.toFixed(3)}`);
    valueText.height = "22px";
    valueText.color = "#d1d5db";
    valueText.fontSize = 15;
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    slider.onValueChangedObservable.add((value) => {
      this.arenaScaleInAR = Number(value.toFixed(3));
      valueText.text = `Escala: ${this.arenaScaleInAR.toFixed(3)}`;

      if (this.isInAR && this.hasUserPlacedArenaInXR) {
        this.applyArenaScale(this.arenaScaleInAR);
      }
    });

    const okButton = Button.CreateSimpleButton("scale-ok-btn", "✓ OK");
    okButton.width = "80px";
    okButton.height = "32px";
    okButton.color = "white";
    okButton.cornerRadius = 8;
    okButton.background = "#22c55e";
    okButton.fontSize = 16;

    okButton.onPointerClickObservable.add(() => {
      this.isScaleToolActive = false;
      this.setScalePanelVisible(false);
      this.updateUI();
    });

    stack.addControl(title);
    stack.addControl(slider);
    stack.addControl(valueText);
    stack.addControl(okButton);
    panel.addControl(stack);
    this.ui.addControl(panel);

    this.scalePanel = panel;
    this.scaleSlider = slider;
    this.scaleValueText = valueText;
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
      this.setHitCursorVisible(false);
      this.setScalePanelVisible(false);
      this.updateUI();
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
    // hitTest so e seguro depois que o SLAM tem pose (NORMAL ou LIMITED).
    // INITIALIZING/RELOCALIZING/null BLOQUEIAM — foi onde o WASM estourava.
    return this.latestTrackingStatus !== null && HITTEST_SAFE_STATUSES.includes(this.latestTrackingStatus);
  }

  /** Texto de status na tela (o celular nao tem console acessivel). */
  private trackingHintText(): string {
    const status = this.latestTrackingStatus ?? "iniciando";

    if (!this.isTrackingReady()) {
      return `Tracking: ${status} | mova o celular devagar p/ estabilizar`;
    }

    return status === "NORMAL"
      ? `Tracking: ${status} | aponte pro chao e toque`
      : `Tracking: ${status} | da pra posicionar (NORMAL fica mais preciso)`;
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

  private async toggleAR(): Promise<void> {
    if (this.isEnteringAR) {
      return;
    }

    if (!this.isXR8Ready || !this.isARSupported || !window.XR8) {
      this.updateUI("RA indisponivel", true);
      return;
    }

    if (this.isInAR) {
      this.exitAR();
      return;
    }

    await this.enterAR(window.XR8);
  }

  private async enterAR(xr8: XR8Api): Promise<void> {
    this.isEnteringAR = true;
    this.updateUI("Iniciando RA...", false);

    try {
      await this.requestMotionPermission();

      installBabylonGlobalsForXR8();
      xr8.XrController.configure({ scale: "absolute" });
      xr8.addCameraPipelineModule(this.createStatusPipelineModule());

      this.nonARScale.copyFrom(this.arenaRoot.scaling);
      this.applyArenaScale(this.arenaScaleInAR);
      this.arenaRoot.setEnabled(false);
      this.hasUserPlacedArenaInXR = false;
      this.latestTrackingStatus = null;
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
    } finally {
      this.isEnteringAR = false;
    }
  }

  private exitAR(): void {
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
    return {
      name: "gate-ar-status",
      onUpdate: (event) => {
        const status = event?.processCpuResult?.reality?.trackingStatus;

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
        }, 0);
      },
      onException: (error) => {
        console.error("[EighthWallARManager] Erro no engine 8th Wall.", error);

        window.setTimeout(() => {
          this.exitAR();
          this.updateUI("Falha ao iniciar RA", true);
        }, 0);
      },
    };
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

  private setScalePanelVisible(value: boolean): void {
    if (!this.scalePanel) {
      return;
    }

    this.scalePanel.isVisible = value;

    if (this.scaleSlider && this.scaleValueText) {
      this.scaleSlider.value = this.arenaScaleInAR;
      this.scaleValueText.text = `Escala: ${this.arenaScaleInAR.toFixed(3)}`;
    }
  }

  private applyArenaScale(value: number): void {
    this.arenaRoot.scaling.setAll(value);
  }

  private updateUI(customLabel?: string, warning = false): void {
    if (!this.toggleButton || !this.statusText) {
      return;
    }

    this.refreshPlacementOverlay();

    if (customLabel) {
      this.statusText.isVisible = true;
      this.statusText.text = customLabel;
      this.toggleButton.background = warning ? "#7c2d12" : "#1f3a4d";
      return;
    }

    if (!this.isXR8Ready) {
      this.toggleButton.isVisible = true;
      this.statusText.text = this.hasXR8LoadFailed ? "RA indisponivel" : "Carregando RA...";
      this.toggleButton.background = "#1f3a4d";
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.isARSupported) {
      this.toggleButton.isVisible = true;
      this.statusText.text = "RA indisponivel";
      this.toggleButton.background = "#1f3a4d";
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.isInAR) {
      // Fora do AR: apenas toggle visivel
      this.toggleButton.isVisible = true;
      this.statusText.text = "RA: Off";
      this.toggleButton.background = "#1f3a4d";
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.hasUserPlacedArenaInXR) {
      // AR + arena nao posicionada: exibir scale panel no lugar do toggle
      this.toggleButton.isVisible = false;
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(true);
      this.statusText.text = this.trackingHintText();
      return;
    }

    if (this.isScaleToolActive) {
      // AR + arena posicionada + escala ativa: scale panel no lugar do toggle
      this.toggleButton.isVisible = false;
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(true);
      this.statusText.text = "RA: On | Ajuste a escala da arena";
      return;
    }

    // AR + arena posicionada: toggle + botao escala
    this.toggleButton.isVisible = true;
    this.toggleButton.background = "#216e39";
    if (this.scaleButton) this.scaleButton.isVisible = true;
    this.setScalePanelVisible(false);
    this.statusText.text = "RA: On | Arena posicionada";
  }
}
