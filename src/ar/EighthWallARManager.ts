import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Button, Control, Ellipse, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

import type { ArenaClosedReport, ArSessionController } from "./ArSessionController";
import { ArenaGhost } from "./ArenaGhost";
import { ARENA_FACING_FORWARD, headingDegFromForward } from "./arenaHeading";
import { attachCoachingOverlay, detachCoachingOverlay } from "./coachingOverlay";
import { addedSince } from "./observerLeak";
import { PLAYER_EYE_HEIGHT_M } from "../camera/arenaFraming";
import { playSpawnScaleIn } from "../fx/spawnAnimation";
import { DiagnosticsOverlay } from "../ui/DiagnosticsOverlay";
import { THUMB_ZONE_HEIGHT_FRACTION, type HudLayer } from "../ui/HudLayer";

const XR8_LOAD_TIMEOUT_MS = 15000;
// Teto de frames aguardando a viewport estabilizar depois do fullscreen.
const VIEWPORT_SETTLE_MAX_FRAMES = 30;

const STATUS_MODULE_NAME = "gate-ar-status";

/**
 * Quantas etapas do ciclo de vida cabem no painel de `?debug=1`.
 *
 * O painel corta valor comprido pela DIREITA (`DiagnosticsOverlay.render`), e
 * numa trilha que cresce a etapa mais nova e justamente a que interessa — ou
 * seja, o corte dele apagaria a informacao. Entao a trilha do painel mostra a
 * cauda e marca com reticencias que houve corte; o console recebe sempre a
 * trilha inteira.
 */
const LIFECYCLE_TRAIL_MAX_STAGES = 4;

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
 * ## A inversao da spec 08: o conteudo nunca se move
 *
 * Este modulo ja COLOCOU a arena (o jogador mirava um ponto do chao e a arena
 * caia ali) e depois a ANCOROU no jogador (ela nascia onde a pessoa estava,
 * medindo o piso por `hitTest` e fit de plano). As duas versoes arrastavam
 * `arenaRoot.position` pelo mundo. Nenhum exemplo oficial do 8th Wall faz isso:
 * em todos, o conteudo fica em coordenadas autorais FIXAS e quem se move e a
 * origem da camera.
 *
 * Aplicado ao Tower Gate: a arena e autorada NA ORIGEM, com o arco abrindo no
 * azimute 0 (o +Z do mundo). O jogador e o vertice do arco — logo o jogador E a
 * origem. `arenaRoot.position` e `(0,0,0)` e `rotationQuaternion` e identidade,
 * PARA SEMPRE; nada neste arquivo escreve nesses campos.
 *
 * O que sobrou de "colocar a arena" e um toque que confirma. Ele nao mede nada,
 * nao pode ser recusado, e a partir da F4 ele vira `recenter()` — o unico jeito
 * de mover a arena, que na verdade move o jogador.
 *
 * ## O que morreu junto, e por que nao volta
 *
 * `placementGate.ts`, `floorEstimate.ts` e `hitTestSampling.ts` existiam para
 * resolver um problema que o engine nao tem. `hitTest` continua sendo uma
 * consulta legitima sobre geometria pontual, mas nunca mais e a fundacao do
 * grounding — o piso e declarado, nao medido.
 */
export class EighthWallARManager implements ArSessionController {
  public readonly onArenaClosedObservable = new Observable<ArenaClosedReport>();
  public readonly onSessionFailedObservable = new Observable<string>();
  public readonly onAvailabilityChangedObservable = new Observable<boolean>();
  public readonly onTrackingStatusChangedObservable = new Observable<XR8TrackingStatus>();

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

  /**
   * A camera de RA, criada UMA vez e reusada em todas as sessoes.
   *
   * Ela era descartada no `exitAR` e recriada no `enterAR` seguinte, e isso
   * quebrava a segunda sessao de um jeito silencioso. O modulo `babylonjsrenderer`
   * do 8th Wall guarda as ultimas intrinsics num fechamento que sobrevive ao
   * `stop()`, e so chama `camera.freezeProjectionMatrix(...)` quando elas MUDAM
   * — o mesmo aparelho devolve as mesmas intrinsics, entao uma camera nova
   * nunca receberia a matriz de projecao do device e ficaria com o campo de
   * visao padrao do Babylon, desalinhado do feed.
   *
   * Reusar a camera tem um preco que o `enterAR` paga explicitamente: a pose
   * dela precisa voltar para a origem declarada antes de cada attach.
   */
  private arCamera: FreeCamera | null = null;
  private previousCamera: Camera | null = null;
  private cameraBehavior: Behavior<Camera> | null = null;
  /**
   * Os observers de render que o `attach` do 8th Wall registrou nesta sessao,
   * para que o `exitAR` possa remover o que o `detach` dele nao remove. Ver
   * `./observerLeak.ts` para o mecanismo.
   */
  private behaviorRenderObservers: {
    observable: Observable<Scene>;
    observer: Observer<Scene>;
  }[] = [];

  private isXR8Ready = false;
  private hasXR8LoadFailed = false;
  private isARSupported = false;
  private isInAR = false;
  private isEnteringAR = false;
  private hasClosedArena = false;
  private nonARScale = new Vector3(1, 1, 1);
  private latestTrackingStatus: XR8TrackingStatus | null = null;

  /**
   * O gesto de colocacao foi dado e a sessao espera o tracking voltar a
   * `NORMAL` para revelar a arena. Ver `confirmArenaHere`.
   */
  private isSettlingArena = false;
  /** O HUD de batalha foi escondido pela transicao e precisa voltar no fim. */
  private restoreBattleHudOnSettle = false;

  /** Quantas vezes esta pagina entrou em RA. So instrumentacao. */
  private sessionCount = 0;
  /** Etapas do ciclo de vida da sessao corrente, na ordem em que dispararam. */
  private lifecycleTrace: string[] = [];


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
   * Volta para a fase de confirmacao sem derrubar a sessao. Privado: quem
   * aciona e o botao "Reposicionar" de `?debug=1`, aqui dentro.
   *
   * Nao ha mais ancora a zerar: a arena continua exatamente onde sempre esteve,
   * na origem. O botao devolve a sessao ao modo de setup, e o proximo toque
   * passa pelo MESMO `confirmArenaHere()` da colocacao inicial — reposicionar
   * nao e um caminho paralelo, e o mesmo gesto uma segunda vez.
   *
   * O HUD de batalha sai de cena junto (`DR-3`: o gesto e uma transicao de
   * fase, nao uma correcao no meio da acao) e volta quando o tracking voltar.
   * O relogio da partida NAO para: ele e de parede por decisao antiga, e pausar
   * a apresentacao nao pode virar pausar a partida.
   */
  private repositionArena(): void {
    if (!this.isInAR || this.isSettlingArena) {
      return;
    }

    if (this.hasClosedArena) {
      this.restoreBattleHudOnSettle = true;
      this.hud.setBattleHudVisible(false);
    }

    this.hasClosedArena = false;
    this.arenaRoot.setEnabled(false);
    this.arenaGhost?.setState("calibrating");
    this.arenaGhost?.setVisible(true);
    this.setSetupPanelVisible(false);
    this.updateUI();
  }

  /**
   * Yaw da camera em relacao ao azimute 0 da arena, em graus, positivo para a
   * direita do jogador. E o insumo de `framedSectors`/`pickSpawnSector` — todo
   * o resto do jogo pergunta "para onde o jogador esta olhando?" por aqui.
   *
   * Nao ha subtracao de ancora nenhuma, e essa ausencia e o ponto: com o
   * `arenaRoot` na origem sem rotacao, o azimute 0 do arco E o +Z do mundo, e
   * o heading do device JA e o yaw relativo. A versao anterior media contra um
   * `forwardYawDeg` guardado no fechamento — e como o zero do heading estava
   * 180 graus invertido, a subtracao cancelava o erro e escondia o bug.
   */
  public getCameraYawDeg(): number {
    return this.currentHeadingDeg();
  }

  public initialize(): void {
    // O slot "ar-scale" da barra superior ficou sem dono (a escala virou
    // constante). Esconder o slot inteiro fecha o vao de 76px que sobraria.
    this.hud.setSlotVisible("ar-scale", false);
    this.createSetupPanelUI();
    this.createLoaderUI();
    this.arenaGhost = new ArenaGhost(this.scene);
    this.arenaGhost.setVisible(false);
    // O toque NAO e assinado aqui: quem escuta `onPointerObservable` e o
    // `WorldTapRouter`, que chama `tryCloseArenaAtPlayer()` na fase `ar-setup`.
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
   * Loader central exibido enquanto o engine ainda nao reportou nada, no lugar
   * das mensagens do topo. Um anel estatico + um ponto que orbita formam o
   * spinner; um prompt central separado aparece quando o tracking fica pronto.
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

    // O texto voltou a prometer a escolha de direcao, e agora ele pode: a
    // RA-F4 poe `recenter()` no toque, e o azimute 0 do arco passa a ser a
    // direcao em que o celular aponta no momento do gesto. Entre a RA-F2 e a
    // RA-F4 esta promessa era mentira — o azimute 0 era o +Z do mundo, fixo
    // desde o frame zero, e girar antes de tocar nao escolhia nada.
    const prompt = new TextBlock("ar-place-prompt", "Vire para onde quer olhar\ne toque para entrar");
    prompt.color = "white";
    // 28 e o piso de legibilidade que `src/ui/guiUnits.test.ts` mede (~16px CSS
    // em retrato de ~412px). O valor era 20 desde quando o prompt cabia numa
    // linha; agora ele tem duas, e e o texto central da fase de colocacao.
    prompt.fontSize = 28;
    prompt.textWrapping = true;
    prompt.width = "78%";
    prompt.height = "88px";
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
   * Sincroniza o overlay central com a fase de setup:
   * - sessao subindo, sem `trackingStatus` ainda → loader girando;
   * - calibrando (o engine ja reporta status) → quem fala e o coaching overlay
   *   oficial do 8th Wall, entao o loader sai de cena para nao competir;
   * - tracking NORMAL, ainda nao confirmado → prompt "toque para entrar";
   * - fora disso → nada, e o texto do topo volta a valer.
   */
  private refreshPlacementOverlay(): void {
    const inPlacement = this.isInAR && !this.hasClosedArena;
    // Durante a espera do gesto o toque JA foi dado e nao faz mais nada. Um
    // prompt dizendo "toque" com o toque inerte le como controle quebrado — o
    // projeto ja aprendeu isso com a carta que recusava em silencio.
    const settling = this.isSettlingArena;
    const ready = inPlacement && !settling && this.isTrackingReady();
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
    // explicito a dar (`updateUI(customLabel)`), e some sozinho no proximo
    // update sem aviso. Durante o setup quem fala e o overlay central e o
    // coaching overlay oficial do 8th Wall; depois de confirmar, ninguem.
    this.hud.setArStatusVisible(false);
  }

  /**
   * Painel de setup. Sobrou dele APENAS o "Reposicionar", e apenas com
   * `?debug=1`: o botao "Comecar" saiu de cena porque quem inicia a partida
   * agora e o gesto do Beat 5 (tocar na torre inimiga) — a spec proibe botao
   * de comecar em qualquer lugar da tela.
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
    // ACIMA da zona do polegar, e nao encostado na borda de baixo. Em device
    // (2026-08-21) este painel cobria duas cartas inteiras — Tatu Bola e Dona
    // Barata ficavam intocaveis enquanto o `?debug=1` estivesse ligado.
    //
    // A margem vem de `THUMB_ZONE_HEIGHT_FRACTION`, e nao de um numero solto:
    // e a mesma fonte que o `OffscreenIndicator` usa para nao prender a seta em
    // cima das cartas. Se a zona do polegar mudar de tamanho, este painel
    // acompanha sozinho.
    panel.top = `-${THUMB_ZONE_HEIGHT_FRACTION * 100 + 3}%`;
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
   * Confirma a arena e devolve `true` quando o toque PERTENCE a confirmacao.
   *
   * Chamado pelo `WorldTapRouter` na fase `ar-setup`; tambem consultado nas
   * fases seguintes, porque o "Reposicionar" de `?debug=1` devolve a sessao ao
   * modo de setup no meio do jogo.
   *
   * A regra que a spec 08 impos: isto NAO PODE FALHAR. Nao ha piso a medir,
   * altura a validar nem superficie a encontrar — a arena ja esta na origem
   * desde o primeiro frame. "Toquei varias vezes e nao aconteceu nada" deixou
   * de ser um estado alcancavel.
   *
   * Desde a RA-F4 o toque tambem ESCOLHE A DIRECAO, via `confirmArenaHere()`.
   * Por isso o `true` daqui nao significa mais "a arena apareceu": significa
   * "o toque era meu". A arena aparece quando o tracking voltar a `NORMAL`, e
   * quem avisa e o `onArenaClosedObservable`, como sempre.
   */
  public tryCloseArenaAtPlayer(): boolean {
    if (!this.isInAR || this.hasClosedArena || this.isSettlingArena) {
      return false;
    }

    this.confirmArenaHere();

    return true;
  }

  /**
   * O gesto de colocacao: o jogador vira o arco para onde esta olhando.
   *
   * `recenter()` e o UNICO jeito de mover a arena neste projeto — e ele nao
   * move a arena, move o jogador. A arena continua onde sempre esteve, na
   * origem; o que o engine faz e remapear o mundo para que a pose ATUAL do
   * device vire a origem declarada, com o `facing` que fixa o azimute 0 no +Z.
   * Como o jogador e o vertice do arco, ancorar e reposicionar sao o mesmo
   * gesto, e este metodo serve aos dois.
   *
   * ## Por que ele entra como transicao, e nao como correcao instantanea
   *
   * Decisao `DR-3`: `recenter()` descarta o mapa do SLAM, o tracking cai para
   * `LIMITED` e leva mais de 30 s para reconvergir. Entao o gesto devolve o
   * coaching overlay, esconde a arena e so entrega o mundo de volta quando o
   * tracking estiver `NORMAL` outra vez.
   *
   * **Isto ainda nao foi visto em device.** Se o custo previsto por `DR-3` nao
   * aparecer — se o tracking nunca sair de `NORMAL` —, a transicao fecha no
   * frame seguinte e o gesto parece instantaneo. Essa e a leitura honesta do
   * resultado, e nao um bug: o gate espera pelo estado, nao por um relogio.
   */
  public confirmArenaHere(): void {
    if (!this.isInAR || this.isSettlingArena) {
      return;
    }

    const xr8 = window.XR8;

    // A arena sai de cena ANTES do recenter: durante o remapeamento ela estaria
    // desenhada contra um mundo que ja mudou de lugar.
    this.hasClosedArena = false;
    this.arenaRoot.setEnabled(false);
    this.arenaGhost?.setState("calibrating");
    this.arenaGhost?.setVisible(true);
    this.setSetupPanelVisible(false);

    // O overlay oficial volta a falar, porque a partir daqui o que o jogador
    // precisa fazer e exatamente o que ele pede: mover o celular ate a escala
    // reconvergir.
    //
    // Desanexar antes de anexar nao e paranoia: na colocacao INICIAL o modulo
    // ainda esta registrado (quem o remove e `finishPlacementCoaching`, que so
    // roda no fim), e o engine recusa nome repetido com um aviso no console em
    // vez de re-anexar. O ciclo tambem re-arma o estado interno do overlay, que
    // guarda o ultimo `trackingStatus` num fechamento de modulo.
    if (xr8) {
      detachCoachingOverlay(xr8);
      attachCoachingOverlay(xr8);
    }

    this.isSettlingArena = true;
    this.latestTrackingStatus = null;
    this.diagnostics?.setField("arena", "recentrando");
    this.traceLifecycle("recenter");

    try {
      xr8?.XrController.recenter();
    } catch (error) {
      console.error("[EighthWallARManager] Falha ao recentrar a arena.", error);
    }

    this.updateUI();
  }

  /**
   * Fim da transicao: o tracking voltou, a arena volta com ele.
   *
   * Chamado do `onUpdate` do pipeline, a CADA frame em que a espera esteja
   * aberta e o tracking pronto — e nao na mudanca de status. A diferenca
   * importa: se `recenter()` nao derrubar o tracking, nao existe mudanca para
   * escutar, e um gate preso em "espere virar NORMAL" nunca abriria.
   */
  private finishArenaSettle(): void {
    this.isSettlingArena = false;

    this.applyArenaScale();
    this.arenaRoot.setEnabled(true);
    // A arena surge crescendo a partir da origem, em vez de aparecer inteira.
    playSpawnScaleIn(this.arenaRoot, this.scene);

    this.hasClosedArena = true;
    this.arenaGhost?.setVisible(false);
    this.finishPlacementCoaching();
    this.diagnostics?.setField("arena", "confirmada");

    if (this.restoreBattleHudOnSettle) {
      this.restoreBattleHudOnSettle = false;
      this.hud.setBattleHudVisible(true);
    }

    this.updateUI();

    this.onArenaClosedObservable.notifyObservers({
      trackingStatus: this.latestTrackingStatus,
    });
  }

  /**
   * Fim do setup de RA. O coaching overlay some sozinho ao chegar em NORMAL,
   * mas o modulo continua vivo e reapareceria por cima do jogo se o tracking
   * degradasse — por isso ele e removido aqui, e nao apenas escondido.
   */
  private finishPlacementCoaching(): void {
    const xr8 = window.XR8;

    if (xr8) {
      detachCoachingOverlay(xr8);
    }
  }

  /**
   * Heading (graus) para onde o device aponta AGORA, na convencao de
   * `arenaHeading`: 0 = +Z do mundo, positivo para a direita do jogador.
   *
   * A componente Y do olhar e descartada de proposito — inclinar o celular para
   * baixo para olhar o chao nao pode mudar para que flanco ele aponta.
   *
   * Le a camera de RA DENTRO da sessao e a `scene.activeCamera` fora dela: no
   * modo tela quem dirige a camera e o jogador pelo mouse/toque, e a mesma
   * medida vale — e o que mantem a regra de que a logica de jogo independe do
   * modo de render.
   *
   * A condicao e `isInAR`, e nao "a `arCamera` existe", porque desde que ela
   * passou a ser reusada entre sessoes ela existe TAMBEM no modo tela — parada
   * na ultima pose do device. Perguntar por existencia devolveria o yaw
   * congelado da sessao anterior para o jogo inteiro.
   */
  private currentHeadingDeg(): number {
    const camera = this.isInAR && this.arCamera ? this.arCamera : this.scene.activeCamera;

    if (!camera) {
      return 0;
    }

    const forward = camera.getDirection(Vector3.Forward());

    return headingDegFromForward(forward.x, forward.z);
  }

  /** O SLAM ja convergiu a escala absoluta? So `NORMAL` conta. */
  private isTrackingReady(): boolean {
    return this.latestTrackingStatus === "NORMAL";
  }

  /** Texto de status na tela (o celular nao tem console acessivel). */
  private trackingHintText(): string {
    const status = this.latestTrackingStatus ?? "iniciando";

    return this.isTrackingReady()
      ? `Tracking: ${status} | toque para entrar`
      : `Tracking: ${status} | mova o celular p/ frente e p/ tras`;
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
    this.sessionCount += 1;
    this.lifecycleTrace.length = 0;
    this.traceLifecycle("enter");
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

      // `installBabylonGlobalsForXR8()` NAO e chamado aqui, e essa ausencia e o
      // conserto do bug 1 da spec 08: neste ponto o `xr.js` ja executou ha
      // muito tempo, e o shim so serve se existir ANTES dele. Quem instala e
      // carrega, na ordem certa, e `src/ar/xr8Loader.ts`.
      xr8.XrController.configure({ scale: "absolute" });
      xr8.addCameraPipelineModule(this.createStatusPipelineModule());
      // Guia o jogador a mover o celular ate a escala absoluta convergir; ele
      // some sozinho quando o tracking chega em NORMAL.
      attachCoachingOverlay(xr8);

      this.nonARScale.copyFrom(this.arenaRoot.scaling);
      this.applyArenaScale();
      this.arenaRoot.setEnabled(false);
      this.hasClosedArena = false;
      this.isSettlingArena = false;
      this.restoreBattleHudOnSettle = false;
      this.latestTrackingStatus = null;
      this.arenaGhost?.setState("calibrating");
      this.arenaGhost?.setVisible(true);
      // Em RA o grid xadrez denuncia o plano flutuante — escondido; ficam so
      // torres/unidades + sombras de contato no piso real.
      this.setArenaGridVisible(false);
      this.setSetupPanelVisible(false);

      this.previousCamera = this.scene.activeCamera;
      this.previousCamera?.detachControl();

      const camera = this.ensureArCamera();

      // A POSE da camera antes do attach e o que declara a origem do mundo, e
      // vale para as duas componentes: o `onAttach` do modulo Babylon do 8th
      // Wall chama `updateCameraProjectionMatrix({origin: camera.position,
      // facing: camera.rotationQuaternion})` — DEPOIS do `onStart` em que o
      // nosso `applyDeclaredOrigin()` roda. Quem tem a ultima palavra, portanto,
      // e esta pose; e por isso que o piso cai em y = 0 sem medir nada.
      //
      // Zerar aqui virou OBRIGATORIO quando a camera passou a sobreviver a
      // sessao: sem isso a segunda entrada declararia como origem a pose em que
      // o jogador largou o celular na primeira, e o arco nasceria girado.
      camera.position.set(0, PLAYER_EYE_HEIGHT_M, 0);
      camera.rotation.setAll(0);
      this.scene.activeCamera = camera;

      this.cameraBehavior = xr8.Babylonjs.xrCameraBehavior({
        cameraConfig: { direction: xr8.XrConfig.camera().BACK },
      });
      this.attachCameraBehavior(this.cameraBehavior, camera);

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

  /**
   * Derruba a sessao deixando o engine em estado de subir outra.
   *
   * ## A ordem aqui e o conserto, e ela e o inverso da anterior
   *
   * O `detach` do behavior do 8th Wall faz `XR8.stop()` seguido de
   * `XR8.clearCameraPipelineModules()` — ou seja, ele JA remove o modulo de
   * status e o coaching overlay, e na ordem que o engine promete: o `stop`
   * entrega `onDetach` a quem ainda esta anexado, e so entao o `clear` entrega
   * `onRemove` e apaga todo mundo. A versao anterior removia os nossos ANTES
   * disso e com isso engolia o `onDetach` deles — justamente a marca que diz
   * se a sessao chegou a subir.
   *
   * Sobra para nos o que o `detach` do 8th Wall esquece: os observers de render
   * que o `attach` registrou na cena.
   */
  public exitAR(): void {
    const xr8 = window.XR8;

    if (this.cameraBehavior && this.arCamera) {
      this.arCamera.removeBehavior(this.cameraBehavior);
    } else if (xr8) {
      // Sessao que caiu antes de anexar o behavior (permissao negada, viewport
      // que nunca estabilizou). Ninguem vai limpar o pipeline por nos.
      try {
        xr8.removeCameraPipelineModule(STATUS_MODULE_NAME);
      } catch (error) {
        console.warn("[EighthWallARManager] Falha ao remover o modulo de status.", error);
      }

      detachCoachingOverlay(xr8);
    }

    this.cameraBehavior = null;
    this.releaseBehaviorRenderObservers();

    // A `arCamera` NAO e descartada — ver o campo. Ela sai de cena voltando a
    // camera anterior, e volta na proxima sessao com a pose zerada.

    // O attach do behavior desliga o autoClear para desenhar o feed da camera.
    this.scene.autoClear = true;

    if (this.previousCamera) {
      this.scene.activeCamera = this.previousCamera;
      this.previousCamera.attachControl(true);
      this.previousCamera = null;
    }

    this.isInAR = false;
    this.hasClosedArena = false;
    this.isSettlingArena = false;
    this.restoreBattleHudOnSettle = false;
    this.latestTrackingStatus = null;
    this.arenaGhost?.setVisible(false);
    this.setSetupPanelVisible(false);

    // Nao ha `position`/`rotationQuaternion` a restaurar: eles nunca foram
    // tocados. O `arenaRoot` sai da RA exatamente como entrou — na origem, sem
    // rotacao. So a visibilidade e a escala voltam ao estado de modo tela.
    this.arenaRoot.setEnabled(true);
    this.arenaRoot.scaling.copyFrom(this.nonARScale);
    this.setArenaGridVisible(true);

    this.updateUI();
  }

  /** A camera de RA, criada na primeira sessao e reusada em todas. */
  private ensureArCamera(): FreeCamera {
    if (this.arCamera) {
      return this.arCamera;
    }

    const camera = new FreeCamera("ar-camera", new Vector3(0, PLAYER_EYE_HEIGHT_M, 0), this.scene);
    camera.minZ = 0.01;
    camera.maxZ = 1000;
    this.arCamera = camera;

    return camera;
  }

  /**
   * Anexa o behavior do 8th Wall guardando os observers de render que ele
   * registra na cena.
   *
   * O `attach` dele assina `onBeforeRenderObservable` e `onAfterRenderObservable`
   * — e o `detach` nao remove nenhum dos dois. Como os dois `add` sao anonimos
   * (o `Observer` devolvido e jogado fora), a unica forma de alcanca-los depois
   * e comparar a lista antes e depois. O `true` do `addBehavior` e o que torna
   * essa comparacao exata: com ele o attach roda AGORA, no mesmo tick, e nada
   * mais entra na lista no meio.
   *
   * O porque de isto importar esta em `./observerLeak.ts`: sem a remocao, a
   * enesima sessao dirige o pipeline do engine N vezes por frame.
   */
  private attachCameraBehavior(behavior: Behavior<Camera>, camera: FreeCamera): void {
    const beforeRender = this.scene.onBeforeRenderObservable;
    const afterRender = this.scene.onAfterRenderObservable;
    const beforeSnapshot = beforeRender.observers.slice();
    const afterSnapshot = afterRender.observers.slice();

    camera.addBehavior(behavior, true);

    this.behaviorRenderObservers = [
      ...addedSince(beforeSnapshot, beforeRender.observers).map((observer) => ({
        observable: beforeRender,
        observer,
      })),
      ...addedSince(afterSnapshot, afterRender.observers).map((observer) => ({
        observable: afterRender,
        observer,
      })),
    ];

    this.diagnostics?.setField("xr8Observers", String(this.behaviorRenderObservers.length));
  }

  /** Desfaz o que `attachCameraBehavior` guardou. Idempotente. */
  private releaseBehaviorRenderObservers(): void {
    for (const { observable, observer } of this.behaviorRenderObservers) {
      observable.remove(observer);
    }

    this.behaviorRenderObservers = [];
  }

  /**
   * Marca uma etapa do ciclo de vida da sessao e publica a trilha.
   *
   * Existe porque a leitura desta unidade so se decide em device, e device nao
   * tem console: a trilha vai para o painel de `?debug=1` com o numero da
   * sessao na frente. O que cada leitura diz:
   *
   * - `s2 enter>attach>start>update` — a sessao subiu e o pipeline entrega
   *   frame; se a arena mesmo assim nao aparecer, o defeito nao e de ciclo de
   *   vida;
   * - `s2 enter>attach>start` sem `update` — a sessao subiu e o pipeline
   *   emudeceu. E o sintoma de 2026-08-19, e a previsao do vazamento de
   *   observers descrito em `./observerLeak.ts`;
   * - `s2 enter` sozinho — o engine nem chegou a anexar o modulo, e o problema
   *   e antes disso (permissao, canvas, `XR8.run`).
   */
  private traceLifecycle(stage: string): void {
    this.lifecycleTrace.push(stage);

    const shown = this.lifecycleTrace.slice(-LIFECYCLE_TRAIL_MAX_STAGES);
    const elipse = shown.length < this.lifecycleTrace.length ? "…" : "";

    console.info(
      `[EighthWallARManager] sessao ${this.sessionCount}: ${this.lifecycleTrace.join(">")}`
    );
    this.diagnostics?.setField("lifecycle", `s${this.sessionCount} ${elipse}${shown.join(">")}`);
  }

  /**
   * Declara ao engine onde a camera comeca — e, com isso, onde fica o chao.
   *
   * Chamado no `onStart` do pipeline: a essa altura o engine ja esta rodando e
   * a chamada e explicita, em vez de depender do behavior ter lido a posicao da
   * camera no attach. E o mesmo par do exemplo oficial de world tracking
   * (`origin` + `facing`).
   *
   * `facing` identidade nao e neutro por acaso: e ele que fixa o azimute 0 no
   * +Z do mundo. Um `facing` diferente giraria o mundo inteiro debaixo de uma
   * arena que nao tem rotacao para compensar.
   */
  private applyDeclaredOrigin(): void {
    const xr8 = window.XR8;

    if (!xr8) {
      return;
    }

    const origin = this.declaredOrigin();

    xr8.XrController.updateCameraProjectionMatrix({
      origin,
      facing: ARENA_FACING_FORWARD,
    });

    this.diagnostics?.setField("originY", `${PLAYER_EYE_HEIGHT_M.toFixed(2)} (o engine sobrescreve)`);
  }

  /**
   * A origem declarada ao engine.
   *
   * **O `y` daqui e descartado pelo 8th Wall, e isso esta medido.** Em
   * `scale: "absolute"` ele sobrescreve `origin.y` para 1 m: quatro colocacoes
   * com 1,55 declarado deram distancia camera-origem de 1,0049 / 0,9797 /
   * 1,0134 / 1,0043 (device, 2026-08-20). O piso cai em `y = 0` porque o engine
   * assume o celular a 1 m do chao no instante da colocacao — nunca por causa do
   * numero que este projeto declarava.
   *
   * A chamada continua obrigatoria pelo `facing`, que NAO e ignorado: e ele que
   * mantem o azimute 0 no +Z do mundo. O `y` vai junto porque a assinatura pede
   * uma origem completa, e usa `PLAYER_EYE_HEIGHT_M` — a mesma altura do jogador
   * simulado do modo tela — para os dois modos nascerem com a camera na mesma
   * altura.
   *
   * Ate 2026-08-21 este numero vinha de uma preferencia persistida, ajustavel
   * por dois `HeightStepper` na tela. Os controles sairam quando o device
   * provou que o engine descarta o valor; a preferencia saiu junto, porque um
   * numero gravado que nao afeta nada e pior do que numero nenhum — ele aparecia
   * no painel de diagnostico como `originY` e parecia significar alguma coisa.
   */
  private declaredOrigin(): { x: number; y: number; z: number } {
    return { x: 0, y: PLAYER_EYE_HEIGHT_M, z: 0 };
  }

  /**
   * O modulo do app no pipeline do engine: declara a origem, le o tracking e
   * — desde a RA-F5 — marca o ciclo de vida da sessao.
   *
   * As marcas nao sao decoracao: a causa da segunda sessao nao subir foi lida
   * no bundle, nao observada em device, e o que separa "lido" de "provado" e
   * exatamente saber quais destes callbacks disparam na segunda entrada. Ver
   * `traceLifecycle` para como cada trilha se le.
   */
  private createStatusPipelineModule(): XR8CameraPipelineModule {
    let hasDumpedEventKeys = false;
    let hasTracedFirstUpdate = false;

    return {
      name: STATUS_MODULE_NAME,
      onAttach: (event) => {
        this.traceLifecycle("attach");
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
      onStart: () => {
        this.traceLifecycle("start");
        this.applyDeclaredOrigin();
      },
      onDetach: () => {
        this.traceLifecycle("detach");
      },
      onRemove: () => {
        this.traceLifecycle("remove");
      },
      onVideoSizeChange: (event) => {
        this.reportVideoSize(event);
      },
      onUpdate: (event) => {
        // So o PRIMEIRO update da sessao vira marca: o que se quer saber e se o
        // pipeline chegou a entregar um frame, e nao quantos. Marcar todos
        // encheria a trilha e afogaria o console.
        if (!hasTracedFirstUpdate) {
          hasTracedFirstUpdate = true;
          this.traceLifecycle("update");
        }

        const status = event?.processCpuResult?.reality?.trackingStatus;
        const reason = event?.processCpuResult?.reality?.trackingReason;

        this.diagnostics?.setFields({
          trackingStatus: status ?? "n/a",
          trackingReason: reason ?? "n/a",
        });

        if (!status || status === this.latestTrackingStatus) {
          // A espera do gesto de colocacao e avaliada AQUI tambem, e nao so no
          // ramo de mudanca: se `recenter()` nao derrubar o tracking, nao ha
          // mudanca de status para escutar e a arena nunca voltaria.
          if (status && this.isSettlingArena && this.isTrackingReady()) {
            this.finishArenaSettle();
          }

          return;
        }

        console.info(`[EighthWallARManager] trackingStatus: ${status}`);
        this.latestTrackingStatus = status;

        // Recuperar tracking NAO move nada, e isso e decisao (D3 da spec 08).
        // A versao anterior reancorava a arena a cada `LIMITED -> NORMAL`,
        // medindo o piso de novo; hoje a arena nao tem posicao para corrigir, e
        // um salto de relocalizacao move o mundo, nao ela.
        this.arenaGhost?.setState(status === "NORMAL" ? "ready" : "calibrating");

        // Quem transforma isso em `tracking_lost`/`tracking_recovered` e a
        // telemetria da sessao — aqui so publicamos a mudanca.
        this.onTrackingStatusChangedObservable.notifyObservers(status);

        // Reflete o status na tela (celular nao tem console acessivel).
        if (this.isInAR) {
          this.updateUI();
        }

        if (this.isSettlingArena && this.isTrackingReady()) {
          this.finishArenaSettle();
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
   * O painel so existe com `?debug=1` (senao `createSetupPanelUI` nem monta
   * nada) e so depois de confirmar — antes disso nao ha o que "Reposicionar".
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
   * Babylon = 1 metro). O metodo continua existindo (em vez de inlinear
   * `setAll(1)` nos dois call sites) porque `nonARScale`/`applyArenaScale` sao
   * um par simetrico.
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
      // calibracao: nao ha mais o que ajustar antes de confirmar. E nada de
      // texto no topo — o overlay central ja diz o que ha para dizer.
      this.setSetupPanelVisible(false);
      this.diagnostics?.setFields({ tracking: this.trackingHintText() });
      return;
    }

    // Arena confirmada = Beat 4. A tela fica limpa: o texto e zerado (alem de
    // escondido por `refreshPlacementOverlay`) e o unico controle que pode
    // sobrar e o "Reposicionar" de `?debug=1`.
    this.setSetupPanelVisible(true);
    this.hud.setArStatus("");
  }
}
