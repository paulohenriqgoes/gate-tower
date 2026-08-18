import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import "@babylonjs/core/Culling/ray";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Button, Control, Ellipse, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

import type { ArenaAnchor, ArSessionController, PlacementRejection } from "./ArSessionController";
import { ArenaGhost } from "./ArenaGhost";
import { arenaRootYawRad, headingDegFromForward, relativeYawDeg } from "./arenaHeading";
import { installBabylonGlobalsForXR8 } from "./babylonRuntimeGlobals";
import {
  buildFloorBandSamples,
  fitGroundPlane,
  measureProbeCoverage,
  type GroundPlaneFit,
  type ProbeCoverage,
} from "./hitTestSampling";
import {
  canPlace,
  placementMessage,
  placementReason,
  resolvePreviewState,
  type PlacementPreviewState,
} from "./placementGate";
import { attachCoachingOverlay, detachCoachingOverlay } from "./coachingOverlay";
import { playSpawnScaleIn } from "../fx/spawnAnimation";
import { DiagnosticsOverlay } from "../ui/DiagnosticsOverlay";
import type { HudLayer } from "../ui/HudLayer";

const XR8_LOAD_TIMEOUT_MS = 15000;
// Teto de frames aguardando a viewport estabilizar depois do fullscreen.
const VIEWPORT_SETTLE_MAX_FRAMES = 30;

// Amostragem do hitTest para o fit do piso. A grade cobre uma FAIXA na metade
// inferior da tela — onde, em retrato, aparece o chao a frente de quem esta de
// pe. Substituiu o anel ao redor do ponto tocado: a arena nao e mais colocada
// num toque, entao nao ha ponto de toque para amostrar em volta.
//
// A faixa comeca em 0,55 (um pouco abaixo do meio da tela) e para em 0,92 (a
// ultima faixa da tela pega o chao quase debaixo dos pes, em incidencia
// rasissima). O recuo lateral de 0,18 tira as quinas pelo mesmo motivo.
const FLOOR_BAND_ROWS = 3;
const FLOOR_BAND_COLS = 4;
const FLOOR_BAND_Y_TOP = 0.55;
const FLOOR_BAND_Y_BOTTOM = 0.92;
const FLOOR_BAND_X_INSET = 0.18;
const MIN_INLIERS = 3;

// Distancia maxima ao plano ajustado para um ponto contar como "mesma
// superficie". Subiu de 4 para 6 cm depois do primeiro teste em device: com o
// plano ja refeito sobre o contorno inteiro, o que sobra de erro e o proprio
// ruido do hitTest em incidencia rasa nos cantos distantes, e 4 cm ficava
// dentro dele. 6 cm ainda separa a mesa do chao (~70 cm abaixo) com folga.
const COVERAGE_PLANE_TOLERANCE_METERS = 0.06;

// Tipos aceitos nas sondas de desobstrucao. Sem FEATURE_POINT de proposito —
// ver `measureClearanceAtGhost`.
const PROBE_HITTEST_TYPES: XR8HitTestType[] = ["DETECTED_SURFACE", "ESTIMATED_SURFACE"];

// A avaliacao de "da pra fechar aqui?" custa 12 hitTests da faixa de piso + 10
// sondas de desobstrucao. A 60 fps isso seria ~1300 hitTests por segundo e
// derrubaria o device. Entao o preview tem DOIS ritmos: a POSE do contorno
// acompanha o jogador a cada frame (puro calculo sobre o ultimo piso medido,
// ZERO hitTest) e o VEREDITO — a cor do contorno — e recalculado neste
// intervalo.
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

/**
 * Gerencia o modo RA via engine 8th Wall (SLAM), substituindo a sessao WebXR.
 *
 * Na v3 este modulo mudou de responsabilidade. Antes ele COLOCAVA a arena: o
 * jogador mirava um ponto do chao, o gate perguntava "cabe um retangulo de
 * 80 cm ali?" e a arena caia naquele ponto. Agora ele ANCORA o jogador: a
 * arena nasce onde a pessoa esta, com o azimute 0 na direcao em que o celular
 * aponta no instante do fechamento, e o gate pergunta "da pra fechar um arco
 * de 2,2 m em volta de quem esta aqui?".
 *
 * A consequencia que atravessa o resto do projeto e `getCameraYawDeg()`: a
 * partir do fechamento, "para onde o jogador esta olhando" e uma pergunta com
 * resposta numerica, e e ela que decide setor enquadrado, setor de spawn e
 * alerta de flanco. O plano y = 0 do mundo deixou de significar chao — a
 * altura do piso e medida por fit de plano e vive na ancora.
 */
export class EighthWallARManager implements ArSessionController {
  public readonly onArenaClosedObservable = new Observable<ArenaAnchor>();
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
  private hasClosedArena = false;
  private nonARScale = new Vector3(1, 1, 1);
  private latestTrackingStatus: XR8TrackingStatus | null = null;
  private hasFallbackUnlocked = false;
  private fallbackTimeoutId: number | null = null;

  /**
   * Ancoragem vigente. E a origem de TODA leitura de angulo do jogo depois do
   * fechamento — `getCameraYawDeg()` mede a partir do `forwardYawDeg` daqui, e
   * quem consome isso e o `ArenaArc` (setor enquadrado, setor de spawn). Nula
   * enquanto a arena nao fechou.
   */
  private anchor: ArenaAnchor | null = null;

  // Estado do preview de fechamento. `previewFit` e o fit da ULTIMA avaliacao
  // — e ele que ancora a arena no toque, e nao um fit novo tirado no instante
  // do toque: assim a arena fecha exatamente onde o contorno prometeu.
  private previewState: PlacementPreviewState = "waiting-tracking";
  private previewFailures = 0;
  private previewFit: GroundPlaneFit | null = null;
  // Origem do arco na ultima pose: o device projetado no piso medido. Guardada
  // porque o fechamento usa a mesma que o contorno estava mostrando.
  private previewOrigin: Vector3 | null = null;
  // Heading (graus, convencao de `arenaHeading`) do device na ultima pose.
  private previewHeadingDeg = 0;
  private previewCoverage: ProbeCoverage | null = null;
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
   * Volta para a fase de fechamento sem derrubar a sessao. Antes disso, uma vez
   * ancorada a arena so dava para refazer saindo e voltando da RA.
   *
   * A ancora e ZERADA junto. Ela e o zero de `getCameraYawDeg()`, e manter a
   * antiga aqui deixaria o jogo medindo azimute contra uma direcao que nao
   * existe mais — o tipo de erro que so aparece tres modulos adiante, como
   * inimigo nascendo no setor errado.
   */
  public repositionArena(): void {
    if (!this.isInAR) {
      return;
    }

    this.hasClosedArena = false;
    this.anchor = null;
    this.arenaRoot.setEnabled(false);
    this.resetPreview();
    this.setSetupPanelVisible(false);
    this.updateUI();
  }

  /**
   * Yaw da camera em relacao ao azimute 0 da arena, em graus, positivo para a
   * direita do jogador. E o insumo de `framedSectors`/`pickSpawnSector` — todo
   * o resto do jogo pergunta "para onde o jogador esta olhando?" por aqui.
   *
   * Antes do fechamento devolve 0: nao existe azimute 0 definido ainda, e um
   * numero inventado seria pior que um numero neutro.
   */
  public getCameraYawDeg(): number {
    if (!this.anchor) {
      return 0;
    }

    return relativeYawDeg(this.currentHeadingDeg(), this.anchor.forwardYawDeg);
  }

  /** Ancoragem vigente, ou `null` enquanto a arena nao fechou. */
  public getArenaAnchor(): ArenaAnchor | null {
    return this.anchor;
  }

  /**
   * A arena pode fechar agora? Mesma pergunta que o contorno responde por cor,
   * em forma consultavel por codigo — o motivo vem de `placementReason`, que e
   * vocabulario de maquina (telemetria, painel de debug), nao texto de jogador.
   */
  public canCloseArena(): { ok: true } | { ok: false; reason: string } {
    if (!this.isInAR) {
      return { ok: false, reason: "sessao-inativa" };
    }

    if (this.hasClosedArena) {
      return { ok: false, reason: "arena-ja-fechada" };
    }

    if (!canPlace(this.previewState) || !this.previewFit || !this.previewOrigin) {
      return { ok: false, reason: placementReason(this.previewState) };
    }

    return { ok: true };
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

    const prompt = new TextBlock("ar-place-prompt", "Vire para onde quer olhar e toque para abrir a arena");
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
    const inPlacement = this.isInAR && !this.hasClosedArena;
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
   * A escala da arena tambem nao e ajustavel: ela e fixa em 1 (Etapa 2, cada
   * ator ja nasce com o tamanho fisico definido em `src/arena/metrics.ts`) e
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
   * Loop de preview do fechamento, com os dois ritmos descritos em
   * `PREVIEW_EVAL_INTERVAL_MS`: a pose do contorno acompanha o jogador a cada
   * frame, e o veredito (a cor do contorno) e recalculado a ~5 Hz.
   *
   * O que mudou na v3: a pose deixou de custar um hitTest por frame. O arco nao
   * e mais mirado — ele nasce no proprio device, entao a pose e puro calculo
   * sobre a pose da camera e o ultimo piso medido. O orcamento de hitTest ficou
   * inteiro para o veredito.
   */
  private registerGhostTracking(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      const ghost = this.arenaGhost;

      if (!ghost) {
        return;
      }

      if (!this.isInAR || this.hasClosedArena) {
        ghost.setVisible(false);
        return;
      }

      // Ritmo 1 — pose, todo frame. Sem tracking nao ha hitTest seguro (o WASM
      // do xr-slam estoura), entao o contorno some e quem fala e o coaching
      // overlay.
      if (!this.isTrackingReady()) {
        this.applyPreviewState("waiting-tracking");
        ghost.setVisible(false);
        return;
      }

      // Sem piso medido ainda nao ha onde deitar o arco. Esconder e mais
      // honesto do que desenha-lo no y = 0 do mundo, que e uma altura que nao
      // significa nada em RA.
      ghost.setVisible(this.updateGhostPose(ghost));

      // Ritmo 2 — veredito, a cada PREVIEW_EVAL_INTERVAL_MS.
      const nowMs = performance.now();

      if (nowMs - this.lastPreviewEvalMs < PREVIEW_EVAL_INTERVAL_MS) {
        return;
      }

      this.lastPreviewEvalMs = nowMs;
      this.evaluatePreview();
    });
  }

  /**
   * Recoloca o contorno sob o jogador a partir do ULTIMO piso medido: origem no
   * device projetado no plano, azimute 0 na direcao horizontal atual do device.
   *
   * Devolve `false` quando ainda nao ha piso — o unico caso em que nao existe
   * pose valida. Nao dispara hitTest nenhum: roda a 60 fps.
   */
  private updateGhostPose(ghost: ArenaGhost): boolean {
    const fit = this.previewFit;
    const cameraPosition = this.arCamera?.globalPosition;

    if (!fit || !cameraPosition) {
      return false;
    }

    const origin = this.projectOntoPlane(cameraPosition, fit);
    const headingDeg = this.currentHeadingDeg();

    this.previewOrigin = origin;
    this.previewHeadingDeg = headingDeg;

    ghost.setPose(origin, this.buildAnchorRotation(fit.normal, headingDeg));

    return true;
  }

  /**
   * Uma rodada da avaliacao cara: fit do piso pela faixa inferior da tela + as
   * sondas de desobstrucao ao redor do jogador. O resultado alimenta o gate
   * puro, que e quem decide o estado — aqui nao ha regra de decisao nenhuma, so
   * medicao.
   *
   * A ordem importa e nao e arbitraria: o fit vem primeiro porque as sondas
   * precisam de um plano contra o qual serem julgadas, e a pose do contorno e
   * atualizada com o fit NOVO antes de projetar as sondas — senao elas seriam
   * tiradas de uma pose de um piso que a medicao acabou de corrigir.
   */
  private evaluatePreview(): void {
    const ghost = this.arenaGhost;

    if (!ghost) {
      return;
    }

    const fit = this.sampleFloorFit();

    // O fit e guardado ANTES do veredito, ao contrario do modelo antigo. La o
    // fit so valia se o estado aprovasse, porque ele era o ponto de ancoragem
    // vindo de um toque; aqui ele e a MEDICAO DO CHAO, e uma medicao de chao
    // continua valendo mesmo quando o entorno esta obstruido — e o que permite
    // ao contorno continuar deitado no piso certo enquanto vermelho.
    if (fit) {
      this.previewFit = fit;
      this.updateGhostPose(ghost);
    }

    const deviceHeightM = this.measureDeviceHeight(fit);
    const coverage = fit ? this.measureClearanceAtGhost(ghost, fit) : null;

    this.previewCoverage = coverage;

    const resolved = resolvePreviewState({
      consecutiveFailures: this.previewFailures,
      coverage,
      deviceHeightM,
      hasFallbackUnlocked: this.hasFallbackUnlocked,
      previous: this.previewState,
      trackingStatus: this.latestTrackingStatus,
    });

    this.previewFailures = resolved.consecutiveFailures;

    this.diagnostics?.setFields({
      cameraYawDeg: this.getCameraYawDeg().toFixed(1),
      deviceHeightM: deviceHeightM === null ? "-" : deviceHeightM.toFixed(2),
      previewState: resolved.state,
      probesInFrame: coverage ? `${coverage.inFrame}/${coverage.total}` : "-",
      probesOffPlane: coverage ? `${coverage.offPlane}/${coverage.total}` : "-",
      probesOnPlane: coverage ? `${coverage.onPlane}/${coverage.total}` : "-",
    });

    this.applyPreviewState(resolved.state);
  }

  /**
   * Altura do device acima do piso medido, ao longo da NORMAL do plano — nao a
   * diferenca de Y. Num piso com 5 graus de caimento (ou com a world-up do SLAM
   * levemente torta, que e o caso comum) as duas medidas divergem, e quem
   * decide o gate e a distancia real ao chao, nao a coordenada vertical.
   */
  private measureDeviceHeight(fit: GroundPlaneFit | null): number | null {
    const cameraPosition = this.arCamera?.globalPosition;

    if (!fit || !cameraPosition) {
      return null;
    }

    return Vector3.Dot(cameraPosition.subtract(fit.position), this.safeNormal(fit.normal));
  }

  /**
   * Dispara a grade de hitTests da faixa de piso e faz o fit robusto do plano.
   *
   * As coordenadas ja saem normalizadas em [0,1] de `buildFloorBandSamples`, que
   * e o espaco que o `hitTest` do 8th Wall espera — nao passam por
   * `normalizeToCanvas` porque nao vem de pixel nenhum.
   */
  private sampleFloorFit(): GroundPlaneFit | null {
    const xr8 = window.XR8;

    if (!xr8) {
      return null;
    }

    const samples = buildFloorBandSamples(
      FLOOR_BAND_ROWS,
      FLOOR_BAND_COLS,
      FLOOR_BAND_Y_TOP,
      FLOOR_BAND_Y_BOTTOM,
      FLOOR_BAND_X_INSET
    );

    const points: Vector3[] = [];

    for (const { x, y } of samples) {
      const results = this.safeHitTest(xr8, x, y);

      if (results.length > 0) {
        const { position } = results[0];
        points.push(new Vector3(position.x, position.y, position.z));
      }
    }

    return fitGroundPlane(points, MIN_INLIERS);
  }

  /**
   * Projeta as sondas de desobstrucao na tela, dispara um hitTest em cada uma e
   * mede quantas pertencem ao piso e quantas bateram em superficie real fora
   * dele.
   *
   * As sondas ficam DENTRO do raio minimo de colocacao, em volta do jogador.
   * Muitas delas caem fora do quadro (o chao a 90 cm dos pes de quem olha para
   * a frente esta abaixo da borda inferior da tela), e isso e esperado: sonda
   * fora do quadro nao conta em nada, nem a favor nem contra. O limiar de
   * reprovacao e uma FRACAO das que estao em quadro, justamente para o veredito
   * nao depender de quantas o enquadramento deixou passar.
   */
  private measureClearanceAtGhost(ghost: ArenaGhost, fit: GroundPlaneFit): ProbeCoverage | null {
    const xr8 = window.XR8;

    if (!xr8 || !this.arCamera) {
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
      // Sondas NAO aceitam FEATURE_POINT: um ponto solto no ar, a meio metro do
      // chao, contaria como "aqui tem superficie" e reprovaria um chao livre.
      // Para o fit do piso o tipo continua valendo como ultimo recurso — la o
      // pior caso e o plano tremer, e `fitGroundPlane` rejeita outlier; aqui o
      // pior caso e um veredito errado, que nao tem quem corrija.
      const results = isInFrame ? this.safeHitTest(xr8, screenX, screenY, PROBE_HITTEST_TYPES) : [];
      const hit = results.length > 0
        ? new Vector3(results[0].position.x, results[0].position.y, results[0].position.z)
        : null;

      return { hit, screenX, screenY };
    });

    return measureProbeCoverage(probes, fit, COVERAGE_PLANE_TOLERANCE_METERS);
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
   * Confirma o fechamento do arco no que o contorno esta mostrando. Chamado
   * pelo `WorldTapRouter` na fase `ar-setup` — o AR Manager nao assina mais o
   * ponteiro por conta propria (havia dois assinantes disputando o mesmo
   * POINTERDOWN, ver src/interaction/WorldTapRouter.ts).
   *
   * O toque nao carrega mais informacao NENHUMA de posicao. Antes ele ao menos
   * escolhia para onde olhar; agora quem define origem e azimute e a pose do
   * device no instante do toque, e o dedo so diz "agora". O jogador continua
   * escolhendo — girando o corpo antes de tocar, com o arco na tela mostrando
   * o resultado — mas escolhe com o celular, e nao com o dedo.
   *
   * Devolve `true` quando o toque PERTENCE ao fechamento, mesmo que ele tenha
   * sido recusado.
   */
  public tryCloseArenaAtPlayer(): boolean {
    // Fora do modo de fechamento o toque nao e nosso — devolve `false` para o
    // router (ou a fase) entregar o toque a quem for o dono dele.
    if (!this.isInAR || this.hasClosedArena) {
      return false;
    }

    if (this.closeArenaAtPlayer() === null) {
      // O toque nao mede mais nada: ele CONFIRMA o que o contorno ja esta
      // mostrando. Medir de novo no instante do toque era o que produzia o
      // "toquei e nao aconteceu nada" — o jogador nunca via a reprovacao, e a
      // medicao do toque podia discordar do que estava na tela.
      this.onPlacementRejectedObservable.notifyObservers({
        inFrame: this.previewCoverage?.inFrame ?? 0,
        offPlane: this.previewCoverage?.offPlane ?? 0,
        onPlane: this.previewCoverage?.onPlane ?? 0,
        reason: this.previewState,
        total: this.previewCoverage?.total ?? 0,
      });
      this.updateUI();
    }

    return true;
  }

  /**
   * Fecha o arco na posicao atual do jogador e devolve a ancora resultante
   * (`null` quando o gate recusa).
   *
   * E o momento em que a arena deixa de ser preview e vira referencia: a partir
   * daqui `origin` e o vertice do arco, `forwardYawDeg` e o azimute 0, e todo
   * angulo do jogo passa a ser medido contra eles. Nada disso e re-derivado
   * depois — reancoragem continua foi o que fazia a arena escorregar quando o
   * jogador aproximava o celular.
   *
   * Publico (e nao so acionado pelo toque) porque o Ato 2 da Etapa 10 fecha a
   * arena por enquadramento do Coelho, sem toque nenhum.
   */
  public closeArenaAtPlayer(): ArenaAnchor | null {
    const fit = this.previewFit;
    const origin = this.previewOrigin;

    if (!this.isInAR || this.hasClosedArena || !fit || !origin || !canPlace(this.previewState)) {
      return null;
    }

    const anchor: ArenaAnchor = {
      floorY: origin.y,
      forwardYawDeg: this.previewHeadingDeg,
      origin: origin.clone(),
    };

    this.arenaRoot.rotationQuaternion = this.buildAnchorRotation(fit.normal, anchor.forwardYawDeg);
    this.arenaRoot.position.copyFrom(anchor.origin);
    this.applyArenaScale();
    this.arenaRoot.setEnabled(true);
    // A arena surge crescendo a partir da ancora, em vez de aparecer inteira.
    playSpawnScaleIn(this.arenaRoot, this.scene);

    this.anchor = anchor;
    this.hasClosedArena = true;
    this.clearPlacementFallbackTimer();
    this.arenaGhost?.setVisible(false);
    this.finishPlacementCoaching();
    this.updateUI();
    this.onArenaClosedObservable.notifyObservers(anchor);

    return anchor;
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
   * Heading (graus) para onde o device aponta AGORA, na convencao de
   * `arenaHeading`: 0 = -Z do mundo, positivo para a direita do jogador.
   *
   * A componente Y do olhar e descartada de proposito — inclinar o celular para
   * baixo para olhar o chao nao pode mudar para que flanco ele aponta, e e
   * exatamente isso que o jogador faz o tempo todo durante o setup.
   *
   * Le `arCamera` quando existe e cai em `scene.activeCamera` fora da RA: no
   * modo tela quem dirige a camera e o jogador pelo mouse/toque, e a mesma
   * medida vale — e o que mantem a regra de que a logica de jogo independe do
   * modo de render.
   */
  private currentHeadingDeg(): number {
    const camera = this.arCamera ?? this.scene.activeCamera;

    if (!camera) {
      return 0;
    }

    const forward = camera.getDirection(Vector3.Forward());

    return headingDegFromForward(forward.x, forward.z);
  }

  /**
   * Rotacao do `arenaRoot` (ou do contorno) para um heading: primeiro o yaw que
   * poe o -Z local no heading pedido, depois a inclinacao ate a normal medida
   * do piso.
   *
   * O yaw sai de `arenaRootYawRad`, e o sinal dele NAO e obvio — e o NEGATIVO
   * do heading, com a derivacao escrita naquele arquivo. Errar esse sinal
   * espelha a arena inteira: o flanco esquerdo nasce a direita e ninguem
   * percebe olhando o codigo.
   */
  private buildAnchorRotation(normal: Vector3, headingDeg: number): Quaternion {
    return this.buildGroundAlignedRotation(
      normal,
      Quaternion.FromEulerAngles(0, arenaRootYawRad(headingDeg), 0)
    );
  }

  /**
   * Projeta um ponto do mundo no plano do piso, ao longo da normal dele. E como
   * "o jogador projetado no chao" e calculado: o device menos a propria altura,
   * medida na direcao da normal.
   */
  private projectOntoPlane(point: Vector3, fit: GroundPlaneFit): Vector3 {
    const normal = this.safeNormal(fit.normal);
    const height = Vector3.Dot(point.subtract(fit.position), normal);

    return point.subtract(normal.scale(height));
  }

  /** Normal do fit, com fallback vertical — um fit degenerado nao pode virar NaN. */
  private safeNormal(normal: Vector3): Vector3 {
    return normal.lengthSquared() > 1e-6 ? normal.normalizeToNew() : Vector3.Up();
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
      ? `Tracking: ${status} | vire e toque para abrir`
      : `Tracking: ${status} | da pra abrir, mas a precisao pode cair`;
  }

  /** Liga/desliga o grid xadrez da arena (agrupado sob o no "arena-grid"). */
  private setArenaGridVisible(visible: boolean): void {
    if (!this.arenaGridNode) {
      this.arenaGridNode = this.scene.getTransformNodeByName("arena-grid");
    }

    this.arenaGridNode?.setEnabled(visible);
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
      this.hasClosedArena = false;
      // A ancora e por SESSAO. Uma sessao nova tem tracking novo, origem nova e
      // um azimute 0 novo; herdar o da anterior faria o jogo medir angulo
      // contra uma direcao que nao existe mais — sem erro visivel, so inimigo
      // nascendo no flanco errado.
      this.anchor = null;
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
    this.hasClosedArena = false;
    this.anchor = null;
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
    // Origem e heading vao junto com o fit, e nao por simetria: os tres sao a
    // MESMA medicao vista de tres angulos, e sobreviver um sem os outros
    // deixaria o proximo fechamento usar uma origem de um piso que nao existe
    // mais.
    this.previewOrigin = null;
    this.previewHeadingDeg = 0;
    this.previewCoverage = null;
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

    const isVisible = value && this.hasClosedArena;

    this.setupPanel.isVisible = isVisible;

    if (this.setupButtons) {
      this.setupButtons.isVisible = isVisible;
    }
  }

  /**
   * A escala em RA e fixa: 1 (Etapa 2, `src/arena/metrics.ts` — 1 unidade do
   * Babylon = 1 metro). Ate a Etapa 1 este metodo aplicava o fator de escala
   * global antigo (~0,0333) porque a arena media 80 cm autorada em unidades
   * maiores; agora cada ator ja nasce em metros, entao nao ha mais fator
   * nenhum a aplicar aqui. O metodo continua existindo (em vez de inlinear
   * `setAll(1)` nos dois call sites) porque `nonARScale`/`applyArenaScale`
   * sao um par simetrico — ver `initializeXR8Camera` e `dispose`.
   */
  private applyArenaScale(): void {
    this.arenaRoot.scaling.setAll(1);
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

    if (!this.hasClosedArena) {
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
