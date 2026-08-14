import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import "@babylonjs/core/Culling/ray";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Button, Control, Ellipse, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

import type { ArSessionController, PlacementRejection } from "./ArSessionController";
import { ArenaGhost } from "./ArenaGhost";
import { installBabylonGlobalsForXR8 } from "./babylonRuntimeGlobals";
import {
  buildSampleOffsets,
  fitGroundPlane,
  measureFootprintCoverage,
  normalizeToCanvas,
  type FootprintCoverage,
  type GroundPlaneFit,
} from "./hitTestSampling";
import {
  canPlace,
  placementMessage,
  resolvePreviewState,
  type PlacementPreviewState,
} from "./placementGate";
import { attachCoachingOverlay, detachCoachingOverlay } from "./coachingOverlay";
import { AR_ARENA_SCALE } from "../arena/ArenaSystem";
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

// Distancia maxima ao plano ajustado para um ponto contar como "mesma
// superficie". Subiu de 4 para 6 cm depois do primeiro teste em device: com o
// plano ja refeito sobre o contorno inteiro, o que sobra de erro e o proprio
// ruido do hitTest em incidencia rasa nos cantos distantes, e 4 cm ficava
// dentro dele. 6 cm ainda separa a mesa do chao (~70 cm abaixo) com folga.
const COVERAGE_PLANE_TOLERANCE_METERS = 0.06;

// Tipos aceitos nas sondas do contorno. Sem FEATURE_POINT de proposito — ver
// `measureFootprintAtGhost`.
const PROBE_HITTEST_TYPES: XR8HitTestType[] = ["DETECTED_SURFACE", "ESTIMATED_SURFACE"];

// A avaliacao de "cabe aqui?" custa 1 fit (~19 hitTests) + 8 sondas do
// contorno. A 60 fps isso seria ~1600 hitTests por segundo e derrubaria o
// device. Entao o preview tem DOIS ritmos: a POSE do fantasma acompanha a tela
// a cada frame (1 hitTest central, o mesmo custo do antigo reticle) e o
// VEREDITO — a cor do contorno — e recalculado neste intervalo.
const PREVIEW_EVAL_INTERVAL_MS = 200;
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
  /**
   * Toque que NAO ancorou, com o motivo. Sem isto o unico registro de "nao
   * consegui posicionar" seria a memoria do testador — e o diario ja pagou o
   * preco de tratar isso como anedota.
   */
  public readonly onPlacementRejectedObservable = new Observable<PlacementRejection>();

  private readonly scene: Scene;
  private readonly arenaRoot: TransformNode;
  private readonly groundPlane = new Plane(0, 1, 0, 0);

  private readonly hud: HudLayer;
  private readonly diagnostics: DiagnosticsOverlay | null;
  private arenaGhost: ArenaGhost | null = null;
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

  // Estado do preview de posicionamento. `previewFit` e o fit da ULTIMA
  // avaliacao — e ele que ancora a arena no toque, e nao um fit novo tirado no
  // instante do toque: assim a arena cai exatamente onde o contorno prometeu.
  private previewState: PlacementPreviewState = "waiting-tracking";
  private previewFailures = 0;
  private previewFit: GroundPlaneFit | null = null;
  // Normal da ultima superficie medida, usada para deitar o contorno no piso
  // real em vez de na horizontal do mundo.
  private previewNormal: Vector3 | null = null;
  private previewCoverage: FootprintCoverage | null = null;
  private lastPreviewEvalMs = 0;

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
    this.resetPreview();
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
    this.arenaGhost = new ArenaGhost(this.scene);
    this.arenaGhost.setVisible(false);
    this.registerGhostTracking();
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
    // "Pronto" deixou de ser so tracking: o prompt "aponte e toque" so faz
    // sentido quando o contorno esta de fato verde. Antes ele convidava ao
    // toque em situacoes que o toque ia recusar — a origem do "toquei varias
    // vezes e nao foi".
    const ready = inPlacement && canPlace(this.previewState);
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

  /**
   * Loop de preview do posicionamento, com os dois ritmos descritos em
   * `PREVIEW_EVAL_INTERVAL_MS`: a pose do fantasma acompanha a tela a cada
   * frame, e o veredito (a cor do contorno) e recalculado a ~5 Hz.
   *
   * Substituiu o antigo `registerCursorTracking`, que movia um torus verde sem
   * dizer nada sobre tamanho: o jogador so descobria que o lugar nao servia
   * DEPOIS de tocar e o toque falhar em silencio.
   */
  private registerGhostTracking(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      const ghost = this.arenaGhost;

      if (!ghost) {
        return;
      }

      if (!this.isInAR || this.hasUserPlacedArenaInXR) {
        ghost.setVisible(false);
        return;
      }

      ghost.setVisible(true);

      // Ritmo 1 — pose, todo frame. Sem tracking nao ha hitTest seguro (o WASM
      // do xr-slam estoura), entao o fantasma some e quem fala e o coaching
      // overlay.
      if (!this.isTrackingReady()) {
        this.applyPreviewState("waiting-tracking");
        return;
      }

      const previewPoint = this.previewGroundPoint();

      if (previewPoint) {
        const yaw = this.arenaForwardYaw();
        // A MESMA rotacao que `applyPlacement` daria: yaw + alinhamento a
        // normal real do piso. O contorno tem que deitar onde a arena vai
        // deitar, senao ele mente sobre a inclinacao e desloca as sondas.
        const rotation = this.buildGroundAlignedRotation(
          this.previewNormal ?? Vector3.Up(),
          Quaternion.FromEulerAngles(0, yaw, 0)
        );

        // O ponto mirado E o centro da arena — o contorno nasce em volta dele.
        ghost.setPose(previewPoint, rotation);
      }

      // Ritmo 2 — veredito, a cada PREVIEW_EVAL_INTERVAL_MS.
      const nowMs = performance.now();

      if (nowMs - this.lastPreviewEvalMs < PREVIEW_EVAL_INTERVAL_MS) {
        return;
      }

      this.lastPreviewEvalMs = nowMs;
      this.evaluatePreview(previewPoint !== null);
    });
  }

  /**
   * Uma rodada da avaliacao cara: fit de plano sob o centro da tela + as 8
   * sondas do contorno do fantasma. O resultado alimenta o gate puro, que e
   * quem decide o estado — aqui nao ha regra de decisao nenhuma, so medicao.
   */
  private evaluatePreview(hasPose: boolean): void {
    const ghost = this.arenaGhost;

    if (!ghost) {
      return;
    }

    const canvas = this.scene.getEngine().getRenderingCanvas();
    const center = canvas
      ? { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }
      : null;

    const seedFit = hasPose && center ? this.sampleGroundFit(center.x, center.y) : null;
    const measured = seedFit ? this.measureFootprintAtGhost(ghost, seedFit) : null;
    // O fit que vale e o REFEITO sobre as sondas do contorno inteiro, nao o
    // semente tirado de um anel de 4 cm no centro. Ver `measureFootprintAtGhost`.
    const fit = measured?.fit ?? seedFit;
    const coverage = measured?.coverage ?? null;

    if (fit) {
      this.previewNormal = fit.normal;
    }

    this.previewCoverage = coverage;

    const resolved = resolvePreviewState({
      consecutiveFailures: this.previewFailures,
      coverage,
      fit,
      hasFallbackUnlocked: this.hasFallbackUnlocked,
      previous: this.previewState,
      trackingStatus: this.latestTrackingStatus,
    });

    this.previewFailures = resolved.consecutiveFailures;
    // O fit so e guardado quando o estado aprova: ancorar com o fit de uma
    // avaliacao reprovada colocaria a arena onde o contorno vermelho estava.
    if (canPlace(resolved.state) && fit) {
      this.previewFit = fit;
    }

    this.diagnostics?.setFields({
      previewState: resolved.state,
      probesInFrame: coverage ? `${coverage.inFrame}/${coverage.total}` : "-",
      probesOffPlane: coverage ? `${coverage.offPlane}/${coverage.total}` : "-",
      probesOnPlane: coverage ? `${coverage.onPlane}/${coverage.total}` : "-",
    });

    this.applyPreviewState(resolved.state);
  }

  /**
   * Projeta os 8 pontos do contorno do fantasma para a tela, dispara um
   * hitTest em cada um e mede quantos pertencem a mesma superficie.
   *
   * O `seedFit` entra so como semente. O plano usado para julgar e REFEITO
   * sobre os proprios acertos das sondas, e a razao esta no primeiro teste em
   * device: com o plano vindo de um anel de 4 cm no centro, julgar um canto a
   * 40 cm de distancia extrapola aquela normal por 10x o raio que a produziu —
   * 3 graus de erro viram 2 cm na ponta, 5 graus viram 4,4 cm, e a tolerancia
   * inteira e consumida por ruido. O resultado medido foi 15 recusas por
   * "nao cabe" apontando para o CHAO de uma cozinha, onde cabe qualquer coisa.
   * `fitGroundPlane` ja rejeita outlier por mediana+MAD, entao refazer o fit
   * sobre o contorno inteiro e mais robusto, e nao menos.
   */
  private measureFootprintAtGhost(
    ghost: ArenaGhost,
    seedFit: GroundPlaneFit
  ): { coverage: FootprintCoverage; fit: GroundPlaneFit } | null {
    const xr8 = window.XR8;
    const canvas = this.scene.getEngine().getRenderingCanvas();

    if (!xr8 || !canvas || !this.arCamera) {
      return null;
    }

    const engine = this.scene.getEngine();
    const viewport = this.arCamera.viewport.toGlobal(
      engine.getRenderWidth(),
      engine.getRenderHeight()
    );
    const transform = this.scene.getTransformMatrix();

    const probes = ghost.getProbePoints().map((worldPoint) => {
      const projected = Vector3.Project(worldPoint, Matrix.Identity(), transform, viewport);

      // `Vector3.Project` devolve px de DISPOSITIVO (o viewport vem de
      // getRenderWidth/Height); o hitTest quer [0,1]. Normalizar pelo proprio
      // viewport mantem os dois no mesmo espaco — o erro classico aqui e
      // misturar px CSS com px de dispositivo (ver normalizeToCanvas).
      const screenX = projected.x / viewport.width;
      const screenY = projected.y / viewport.height;

      const isInFrame = screenX >= 0 && screenX <= 1 && screenY >= 0 && screenY <= 1;
      // Sondas NAO aceitam FEATURE_POINT: um ponto solto no ar, a meio metro
      // do chao, contaria como "aqui tem superficie" e envenenaria tanto a
      // contagem quanto o refit. Para a POSE central o tipo continua valendo
      // como ultimo recurso — la o pior caso e o contorno tremer, nao um
      // veredito errado.
      const results = isInFrame ? this.safeHitTest(xr8, screenX, screenY, PROBE_HITTEST_TYPES) : [];
      const hit = results.length > 0
        ? new Vector3(results[0].position.x, results[0].position.y, results[0].position.z)
        : null;

      return { hit, screenX, screenY };
    });

    const hits = probes
      .map((probe) => probe.hit)
      .filter((hit): hit is Vector3 => hit !== null);

    // Refit sobre o contorno inteiro; se as sondas nao derem inliers
    // suficientes, o semente do centro continua valendo.
    const fit = fitGroundPlane([...hits, seedFit.position], MIN_INLIERS) ?? seedFit;

    return { coverage: measureFootprintCoverage(probes, fit, COVERAGE_PLANE_TOLERANCE_METERS), fit };
  }

  /** Aplica o estado no fantasma e no HUD, so quando ele muda de verdade. */
  private applyPreviewState(state: PlacementPreviewState): void {
    if (state === this.previewState) {
      return;
    }

    this.previewState = state;
    this.arenaGhost?.setState(state);
    this.updateUI();
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

    // `createPickingRay` quer px CSS. Passar `getRenderWidth/Height` aqui
    // misturava px de dispositivo com px CSS (fator ~3 no celular) e mirava
    // fora da tela — com o torus isso so desalinhava um anel; com o fantasma
    // desalinharia tambem as 8 sondas tiradas da pose dele.
    const canvas = this.scene.getEngine().getRenderingCanvas();

    if (!canvas) {
      return null;
    }

    return this.pickGroundPoint(canvas.clientWidth / 2, canvas.clientHeight / 2);
  }

  /**
   * Envolve XR8.XrController.hitTest em try/catch. Mesmo com o gate de tracking,
   * o WASM do SLAM pode lancar (RuntimeError) em janelas de relocalizacao — e um
   * throw dentro do render loop mataria a aplicacao inteira.
   */
  private safeHitTest(
    xr8: XR8Api,
    x: number,
    y: number,
    types: XR8HitTestType[] = HITTEST_TYPES
  ): XR8HitTestResult[] {
    try {
      return xr8.XrController.hitTest(x, y, types);
    } catch (error) {
      console.warn("[EighthWallARManager] hitTest falhou (SLAM instavel).", error);
      return [];
    }
  }

  /**
   * Confirma a ancoragem no que o fantasma esta mostrando. Chamado pelo
   * `WorldTapRouter` na fase `ar-setup` — o AR Manager nao assina mais o
   * ponteiro por conta propria (havia dois assinantes disputando o mesmo
   * POINTERDOWN, ver src/interaction/WorldTapRouter.ts).
   *
   * O ponto de ancoragem NAO vem mais de `scene.pointerX/pointerY`: o fantasma
   * mira pelo centro da tela, e o dedo so confirma. Isso elimina a divergencia
   * entre o contorno que o jogador viu e o lugar onde a arena caiu.
   */
  public tryPlaceArenaAtPointer(): boolean {
    // Fora do modo de ancoragem o toque nao e nosso — devolve `false` para o
    // router (ou a fase) entregar o toque a quem for o dono dele.
    if (!this.isInAR || this.hasUserPlacedArenaInXR) {
      return false;
    }

    // O toque nao mede mais nada: ele CONFIRMA o que o fantasma ja esta
    // mostrando. Medir de novo no instante do toque era o que produzia o
    // "toquei e nao aconteceu nada" — o jogador nunca via a reprovacao, e a
    // medicao do toque podia discordar do que estava na tela.
    if (!canPlace(this.previewState) || !this.previewFit) {
      this.onPlacementRejectedObservable.notifyObservers({
        inFrame: this.previewCoverage?.inFrame ?? 0,
        offPlane: this.previewCoverage?.offPlane ?? 0,
        onPlane: this.previewCoverage?.onPlane ?? 0,
        reason: this.previewState,
        total: this.previewCoverage?.total ?? 0,
      });
      this.updateUI();
      return true;
    }

    // Ancora na profundidade real do piso (fit.position) e TRAVA — sem
    // reancoragem continua. Isso corrige o item 2 (arena escorregando ao
    // aproximar o celular por causa de profundidade errada do plano y=0).
    this.applyPlacement(this.previewFit);
    this.arenaRoot.setEnabled(true);
    // A arena surge crescendo a partir da ancora, em vez de aparecer inteira.
    playSpawnScaleIn(this.arenaRoot, this.scene);
    this.hasUserPlacedArenaInXR = true;
    this.clearPlacementFallbackTimer();
    this.arenaGhost?.setVisible(false);
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

  /** Yaw (radianos) equivalente a `arenaForwardDirection`. */
  private arenaForwardYaw(): number {
    const forward = this.arenaForwardDirection();

    return Math.atan2(forward.x, forward.z);
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
      this.resetPreview();
      this.startPlacementFallbackTimer();
      // Em RA o grid xadrez denuncia o plano flutuante — escondido; ficam so
      // torres/unidades + sombras de contato no piso real.
      this.setArenaGridVisible(false);
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
    this.resetPreview();
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
        // O dump das chaves do evento (`Object.keys(event).join(",")`) ja
        // cumpriu o papel dele: a tipagem em `src/types/xr8.d.ts` e o
        // `reportVideoSize` abaixo saem justamente do que ele revelou. Fica
        // so a contagem — a lista inteira e uma linha longa demais e, no
        // device, ela empurrava o resto do painel para fora da tela.
        this.diagnostics?.setField("eventKeys", `${Object.keys(event).length} chaves`);
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

    // O ponto mirado ancora o CENTRO da arena. Antes ele ancorava as "costas"
    // da torre azul, para o campo se estender para longe de um ponto de toque
    // invisivel — um truque que fazia sentido enquanto nao havia nada na tela
    // mostrando onde a arena cairia. Com o contorno visivel ele so afastava a
    // arena de onde a pessoa estava apontando (relatado no teste em device).
    // A leitura de campo nao se perde: o yaw continua colocando a torre azul
    // do lado de quem posicionou.
    this.arenaRoot.position.copyFrom(groundPoint);
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

  /**
   * Zera o preview de posicionamento. Chamado ao entrar e ao sair da RA: sem
   * isto a sessao seguinte comecaria com o contorno na cor da anterior e com
   * um `previewFit` velho, que ancoraria a arena num plano que nao existe
   * mais.
   */
  private resetPreview(): void {
    this.previewState = "waiting-tracking";
    this.previewFailures = 0;
    this.previewFit = null;
    this.lastPreviewEvalMs = 0;
    this.arenaGhost?.setState("waiting-tracking");
    this.arenaGhost?.setVisible(false);
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

      // Quem dita o texto agora e o estado do fantasma — uma frase por
      // situacao, todas acionaveis, e silencio quando nao ha nada util a
      // dizer (o coaching overlay do 8th Wall ja fala na calibracao).
      const message = placementMessage(this.previewState);

      if (message) {
        this.hud.setArStatusVisible(true);
        this.hud.setArStatus(message, this.previewState !== "ready-degraded");
      }

      this.diagnostics?.setFields({ tracking: this.trackingHintText() });
      return;
    }

    // Arena ancorada = Beat 4. A tela fica limpa: o texto e zerado (alem de
    // escondido por `refreshPlacementOverlay`) e o unico controle que pode
    // sobrar e o "Reposicionar" de `?debug=1`.
    this.setSetupPanelVisible(true);
    this.hud.setArStatus("");
  }
}
