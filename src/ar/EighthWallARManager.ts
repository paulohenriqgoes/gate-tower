import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import "@babylonjs/core/Culling/ray";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Button, Control, Ellipse, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

import type { ArSessionController } from "./ArSessionController";
import { installBabylonGlobalsForXR8 } from "./babylonRuntimeGlobals";
import {
  buildSampleOffsets,
  fitGroundPlane,
  measurePlaneCoverage,
  normalizeToCanvas,
  type GroundPlaneFit,
} from "./hitTestSampling";
import { attachCoachingOverlay, detachCoachingOverlay } from "./coachingOverlay";
import { AR_ARENA_SCALE, ARENA_LENGTH_METERS, ARENA_WIDTH_METERS } from "../arena/ArenaSystem";
import { playSpawnScaleIn } from "../fx/spawnAnimation";
import { DiagnosticsOverlay } from "../ui/DiagnosticsOverlay";
import type { HudLayer } from "../ui/HudLayer";

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

// Segunda amostragem, larga, usada SO para medir a extensao da superficie (a
// arena tem 80 cm e nunca e reescalada para caber). Fica separada do fit de
// ancoragem de proposito: o fit ancora no centroide dos inliers, e alargar
// aquele anel deslocaria a ancora para longe do ponto tocado quando parte das
// amostras cai fora da mesa.
const COVERAGE_RADIUS = 0.42;
const COVERAGE_RINGS = 3;
const COVERAGE_PER_RING = 10;
// Distancia maxima ao plano ajustado para um ponto contar como "mesma
// superficie". 4 cm separa a mesa do chao/objetos ao redor sem brigar com o
// ruido do proprio hitTest.
const COVERAGE_PLANE_TOLERANCE_METERS = 0.04;
// A extensao medida e um limite INFERIOR (so enxerga onde os hitTests bateram)
// e vem de ~30 pontos ruidosos; exigir os 80 cm cheios reprovaria mesa boa.
const COVERAGE_REQUIRED_RATIO = 0.9;
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

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Gerencia o modo RA via engine 8th Wall (SLAM), substituindo a sessao WebXR.
 * O chao estimado pelo SLAM fica no plano y = 0 do mundo; posicionamento da
 * arena e cursor usam raycast contra esse plano.
 */
export class EighthWallARManager implements ArSessionController {
  public readonly onArenaPlacedObservable = new Observable<void>();
  public readonly onSessionFailedObservable = new Observable<string>();
  public readonly onAvailabilityChangedObservable = new Observable<boolean>();
  public readonly onTrackingStatusChangedObservable = new Observable<XR8TrackingStatus>();

  private readonly scene: Scene;
  private readonly arenaRoot: TransformNode;
  private readonly groundPlane = new Plane(0, 1, 0, 0);

  private readonly hud: HudLayer;
  private readonly diagnostics: DiagnosticsOverlay | null;
  private hitCursor: Mesh | null = null;
  private setupPanel: Rectangle | null = null;
  private setupButtons: StackPanel | null = null;

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
  private latestTrackingStatus: XR8TrackingStatus | null = null;
  private hasFallbackUnlocked = false;
  private fallbackTimeoutId: number | null = null;

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
    this.arenaRoot.setEnabled(false);
    this.setSetupPanelVisible(false);
    this.updateUI();
  }

  public initialize(): void {
    // O slot "ar-scale" da barra superior ficou sem dono (a escala virou
    // constante). Esconder o slot inteiro fecha o vao de 76px que sobraria; a
    // remocao do slot em si e do HudLayer, que outra etapa reescreve.
    this.hud.setSlotVisible("ar-scale", false);
    this.createSetupPanelUI();
    this.createLoaderUI();
    this.createHitCursor();
    this.registerCursorTracking();
    // O toque NAO e mais assinado aqui: quem escuta `onPointerObservable` e o
    // `WorldTapRouter`, que chama `tryPlaceArenaAtPointer()` na fase
    // `ar-setup` (ver src/interaction/WorldTapRouter.ts).
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

    // O texto do topo e MUDO por padrao. Ele so aparece quando ha um aviso
    // explicito a dar (`updateUI(customLabel)`, ex.: "Aponte para uma
    // superficie maior"), e some sozinho no proximo update sem aviso.
    //
    // Isso vale para os tres estados que antes o mostravam e hoje seriam
    // vazamento de HUD: o menu ("RA: Off" atras da tela inicial), o modo tela
    // (onde o engine termina de carregar depois do jogo ja ter comecado e
    // chamava updateUI) e, principalmente, o Beat 4 — depois de ancorar a tela
    // fica completamente limpa. Durante o posicionamento quem fala e o overlay
    // central (loader/prompt) e o coaching overlay oficial do 8th Wall.
    this.hud.setArStatusVisible(false);
  }

  /**
   * Painel de setup. Sobrou dele APENAS o "Reposicionar", e apenas com
   * `?debug=1`: o botao "Comecar" saiu de cena porque quem inicia a partida
   * agora e o gesto do Beat 5 (tocar na torre inimiga) — a spec proibe botao
   * de comecar em qualquer lugar da tela. Sem `?debug=1` o painel inteiro
   * deixa de existir, e nao ha nenhum HUD entre ancorar a arena e a batalha.
   *
   * A escala da arena tambem nao e ajustavel: ela e a constante
   * `AR_ARENA_SCALE`, porque a arena tem um tamanho fisico definido (80 cm) e
   * um slider so deixaria o jogador desmentir esse tamanho.
   *
   * O "Reposicionar" continua existindo (atras do debug) porque a referencia
   * do 8th Wall recomenda um reposicionamento manual para o residuo de salto
   * de relocalizacao do SLAM — mas como ferramenta de teste, nao como parte da
   * experiencia.
   */
  private createSetupPanelUI(): void {
    if (!DiagnosticsOverlay.isEnabled()) {
      return;
    }

    const ui = this.hud.getTexture();

    const panel = new Rectangle("arena-setup-panel");
    panel.width = `${SETUP_PANEL_WIDTH}px`;
    // O StackPanel ignora filhos invisiveis, entao a altura acompanha o que
    // esta realmente visivel na fase atual.
    panel.adaptHeightToChildren = true;
    panel.cornerRadius = 12;
    panel.color = "#4b5563";
    panel.thickness = 1;
    panel.background = "#111827d9";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.top = "-22px";
    panel.isVisible = false;

    const stack = new StackPanel("arena-setup-stack");
    stack.isVertical = true;
    stack.paddingTop = "10px";
    stack.paddingLeft = "12px";
    stack.paddingRight = "12px";
    stack.paddingBottom = "10px";

    const setupButtons = new StackPanel("arena-setup-buttons");
    setupButtons.isVertical = false;
    setupButtons.height = `${SETUP_BUTTON_HEIGHT}px`;
    setupButtons.spacing = 12;

    const repositionButton = this.createPanelButton("reposition-btn", "Reposicionar", "#1f3a4d");
    repositionButton.onPointerClickObservable.add(() => {
      this.repositionArena();
    });
    setupButtons.addControl(repositionButton);

    stack.addControl(setupButtons);
    panel.addControl(stack);
    ui.addControl(panel);

    this.setupPanel = panel;
    this.setupButtons = setupButtons;
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

  /**
   * Tenta ancorar a arena no ponto atual do ponteiro. Chamado pelo
   * `WorldTapRouter` na fase `ar-setup` — o AR Manager nao assina mais o
   * ponteiro por conta propria (havia dois assinantes disputando o mesmo
   * POINTERDOWN, ver src/interaction/WorldTapRouter.ts).
   *
   * `scene.pointerX/pointerY` continuam sendo a fonte das coordenadas: sao px
   * CSS, e e por `clientWidth/clientHeight` que a normalizacao do hitTest e
   * feita (NUNCA por getRenderWidth, que e px de dispositivo).
   */
  public tryPlaceArenaAtPointer(): boolean {
    // Fora do modo de ancoragem o toque nao e nosso — devolve `false` para o
    // router (ou a fase) entregar o toque a quem for o dono dele.
    if (!this.isInAR || this.hasUserPlacedArenaInXR) {
      return false;
    }

    if (!this.isTrackingReady()) {
      // O loader central ja comunica a espera; nada a fazer no toque.
      return true;
    }

    const fit = this.sampleGroundFit(this.scene.pointerX, this.scene.pointerY);

    if (!fit) {
      this.updateUI("Procure uma superficie e toque novamente", true);
      return true;
    }

    // A arena tem 80 cm e NUNCA e reescalada para caber: se a superficie
    // medida nao comporta esse tamanho, o toque nao posiciona nada.
    if (!this.hasRoomForArena(this.scene.pointerX, this.scene.pointerY, fit)) {
      this.updateUI("Aponte para uma superficie maior", true);
      return true;
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
    this.finishPlacementCoaching();
    this.updateUI();
    this.onArenaPlacedObservable.notifyObservers();

    return true;
  }

  /**
   * Fim do setup de RA. Antes isso morava em `completeSetup()`, chamado pelo
   * botao "Comecar"; o botao deixou de existir (o Beat 5 e quem inicia a
   * partida), entao ancorar a arena passou a SER o fim do setup.
   *
   * O coaching overlay some sozinho ao chegar em NORMAL, mas o modulo continua
   * vivo e reapareceria por cima do jogo se o tracking degradasse — por isso
   * ele e removido aqui, e nao apenas escondido.
   */
  private finishPlacementCoaching(): void {
    const xr8 = window.XR8;

    if (xr8) {
      detachCoachingOverlay(xr8);
    }
  }

  /**
   * Dispara um grid de hitTests (aneis ao redor do toque) e faz o fit robusto de
   * um plano para estimar a profundidade real do piso. Coordenadas de tela em px
   * CSS sao normalizadas por clientWidth/clientHeight (NUNCA getRenderWidth).
   */
  private sampleGroundFit(screenX: number, screenY: number): GroundPlaneFit | null {
    const points = this.collectHitPoints(screenX, screenY, SAMPLE_RADIUS, SAMPLE_RINGS, SAMPLE_PER_RING);

    return fitGroundPlane(points, MIN_INLIERS);
  }

  /**
   * Mede a extensao da superficie ao redor do toque e responde se a arena de
   * 80 cm cabe ali. NUNCA reescala a arena: a resposta e sim ou nao.
   *
   * Usa uma amostragem larga, separada da do fit, porque o fit ancora no
   * centroide dos seus inliers — alargar aquele anel deslocaria a ancora para
   * fora do ponto tocado assim que parte das amostras caisse fora da mesa.
   */
  private hasRoomForArena(screenX: number, screenY: number, fit: GroundPlaneFit): boolean {
    const points = this.collectHitPoints(
      screenX,
      screenY,
      COVERAGE_RADIUS,
      COVERAGE_RINGS,
      COVERAGE_PER_RING
    );

    const coverage = measurePlaneCoverage(
      points,
      fit,
      this.arenaForwardDirection(),
      COVERAGE_PLANE_TOLERANCE_METERS
    );

    this.diagnostics?.setFields({
      surfaceDepth: `${coverage.depth.toFixed(2)}m`,
      surfaceWidth: `${coverage.width.toFixed(2)}m`,
      surfaceInliers: String(coverage.inlierCount),
    });

    return (
      coverage.depth >= ARENA_LENGTH_METERS * COVERAGE_REQUIRED_RATIO
      && coverage.width >= ARENA_WIDTH_METERS * COVERAGE_REQUIRED_RATIO
    );
  }

  /**
   * Dispara um padrao de hitTests em aneis ao redor do ponto tocado. Coordenadas
   * de tela em px CSS sao normalizadas por clientWidth/clientHeight (NUNCA
   * getRenderWidth, que e px de dispositivo).
   */
  private collectHitPoints(
    screenX: number,
    screenY: number,
    radius: number,
    rings: number,
    perRing: number
  ): Vector3[] {
    const xr8 = window.XR8;
    const canvas = this.scene.getEngine().getRenderingCanvas();

    if (!xr8 || !canvas) {
      return [];
    }

    const base = normalizeToCanvas(screenX, screenY, canvas);
    const offsets = buildSampleOffsets(radius, rings, perRing);
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

    return points;
  }

  /**
   * Direcao horizontal para onde o campo se estende: o "olhar" da camera no
   * momento do toque. E o mesmo yaw aplicado em `applyPlacement`, entao a
   * medicao de extensao e a arena falam do mesmo eixo.
   */
  private arenaForwardDirection(): Vector3 {
    const forward = this.arCamera
      ? this.arCamera.getDirection(Vector3.Forward())
      : Vector3.Forward();

    forward.y = 0;

    return forward.lengthSquared() < 1e-6 ? Vector3.Forward() : forward.normalize();
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

      // Orientacao de tela NAO se resolve mais aqui: quem define e aplica a
      // politica (travar retrato) e o GameFlow, ANTES de chamar `enterAR`.
      // Regra que fica: com a sessao no ar nao se pede tela cheia nem
      // `screen.orientation.lock` — cada uma dessas transicoes redimensiona o
      // canvas e reprojeta a cena no meio do tracking, que e o que deixa a
      // cena esticada. Aqui so esperamos a viewport parar de mudar.
      await this.waitForStableViewport();

      installBabylonGlobalsForXR8();
      xr8.XrController.configure({ scale: "absolute" });
      xr8.addCameraPipelineModule(this.createStatusPipelineModule());
      // Guia o jogador a mover o celular ate a escala absoluta convergir; ele
      // some sozinho quando o tracking chega em NORMAL.
      attachCoachingOverlay(xr8);

      this.nonARScale.copyFrom(this.arenaRoot.scaling);
      this.applyArenaScale();
      this.arenaRoot.setEnabled(false);
      this.hasUserPlacedArenaInXR = false;
      this.latestTrackingStatus = null;
      this.hasFallbackUnlocked = false;
      this.startPlacementFallbackTimer();
      // Em RA o grid xadrez denuncia o plano flutuante — escondido; ficam so
      // torres/unidades + sombras de contato no piso real.
      this.setArenaGridVisible(false);
      this.setHitCursorVisible(false);
      this.setSetupPanelVisible(false);

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
    this.hasFallbackUnlocked = false;
    this.setHitCursorVisible(false);
    this.setSetupPanelVisible(false);

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

        // Quem transforma isso em `tracking_lost`/`tracking_recovered` e a
        // telemetria da sessao — aqui so publicamos a mudanca.
        this.onTrackingStatusChangedObservable.notifyObservers(status);

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

    // Alinha o eixo +Z da arena com a direcao horizontal da camera: a torre
    // azul (lado do jogador) fica mais proxima de quem posicionou.
    const forward = this.arenaForwardDirection();
    const yaw = Math.atan2(forward.x, forward.z);
    const yawRotation = Quaternion.FromEulerAngles(0, yaw, 0);

    // Alinha o "up" da arena a normal REAL do piso medida no fit, para ela
    // assentar plana no chao. A world-up do SLAM as vezes nao bate com o piso,
    // o que dava a sensacao de um lado (vermelho) levemente inclinado pra cima.
    const rotation = this.buildGroundAlignedRotation(fit.normal, yawRotation);

    this.arenaRoot.rotationQuaternion = rotation;
    this.applyArenaScale();

    // O toque NAO ancora o centro da arena, e sim as "costas" da torre azul
    // (a borda do lado do jogador). Deslocamos a arena para que esse ponto local
    // caia exatamente no ponto tocado — o campo se estende para frente.
    const anchorLocal = this.getPlacementAnchorLocal().scale(AR_ARENA_SCALE);
    const worldOffset = Vector3.Zero();
    anchorLocal.rotateByQuaternionToRef(rotation, worldOffset);

    this.arenaRoot.position.copyFrom(groundPoint.subtract(worldOffset));
  }

  /**
   * Ponto local da arena a ser ancorado no toque: as costas (lado do jogador) da
   * torre azul. Derivado da propria torre (`tower-blue-*`) para nao hardcodar o
   * layout do ArenaSystem.
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
   * O painel so existe com `?debug=1` (senao `createSetupPanelUI` nem monta
   * nada) e so depois de ancorar — antes disso nao ha o que "Reposicionar".
   * Ele sobrevive a entrada na partida de proposito: e ferramenta de teste
   * para o residuo de salto de relocalizacao do SLAM, nao parte do jogo.
   */
  private setSetupPanelVisible(value: boolean): void {
    if (!this.setupPanel) {
      return;
    }

    const isVisible = value && this.hasUserPlacedArenaInXR;

    this.setupPanel.isVisible = isVisible;

    if (this.setupButtons) {
      this.setupButtons.isVisible = isVisible;
    }
  }

  /** A escala em RA e fixa: a arena tem 80 cm, e isso nao se ajusta. */
  private applyArenaScale(): void {
    this.arenaRoot.scaling.setAll(AR_ARENA_SCALE);
  }

  private updateUI(customLabel?: string, warning = false): void {
    // Guard de "UI ja montada": antes do `initialize()` nao ha o que atualizar.
    // O ponto de referencia e o loader (sempre criado) e nao o painel de setup,
    // que so existe com `?debug=1`.
    if (!this.loaderPanel) {
      return;
    }

    this.refreshPlacementOverlay();

    if (customLabel) {
      this.hud.setArStatusVisible(true);
      this.hud.setArStatus(customLabel, warning);
      return;
    }

    if (!this.isXR8Ready) {
      this.hud.setArStatus(this.hasXR8LoadFailed ? "RA indisponivel" : "Carregando RA...");
      this.setSetupPanelVisible(false);
      return;
    }

    if (!this.isARSupported) {
      this.hud.setArStatus("RA indisponivel");
      this.setSetupPanelVisible(false);
      return;
    }

    if (!this.isInAR) {
      this.hud.setArStatus("RA: Off");
      this.setSetupPanelVisible(false);
      return;
    }

    if (!this.hasUserPlacedArenaInXR) {
      // Nada de painel enquanto o coaching overlay pede o movimento de
      // calibracao: nao ha mais o que ajustar antes de ancorar.
      this.setSetupPanelVisible(false);
      this.hud.setArStatus(this.trackingHintText(), this.hasFallbackUnlocked);
      return;
    }

    // Arena ancorada = Beat 4. A tela fica limpa: o texto e zerado (alem de
    // escondido por `refreshPlacementOverlay`) e o unico controle que pode
    // sobrar e o "Reposicionar" de `?debug=1`.
    this.setSetupPanelVisible(true);
    this.hud.setArStatus("");
  }
}
