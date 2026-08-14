import {
  AdvancedDynamicTexture,
  Container,
  Control,
  Rectangle,
  TextBlock,
} from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core/scene";

import { isPortrait, readSafeAreaInsets, type SafeAreaInsets } from "./screenOrientation";

export type TowerTeam = "player" | "enemy";

// Resolucao de referencia do HUD, sempre com o eixo CURTO da tela valendo
// IDEAL_SHORT. Todo valor em px dos controles e multiplicado por `idealRatio`,
// e com `useSmallestIdeal` o Babylon usa `width/idealWidth` em portrait e
// `height/idealHeight` em paisagem. O jogo esta travado em retrato (ver
// screenOrientation.ts), mas a formula continua guardando o eixo curto: manter
// 1280 fixo na largura espremia o design inteiro em ~390 px CSS de pé — tudo
// ficava ~1.8x menor que em paisagem e os botoes viravam inclicaveis. Esse
// comportamento e o que garante ~82px do espaco ideal por alvo de toque.
const IDEAL_LONG = 1280;
const IDEAL_SHORT = 720;

const AR_STATUS_COLOR = "#cbd5e1";
const AR_STATUS_WARNING_COLOR = "#fca5a5";

const BASE_MARGIN = 22;

// Zona `top`: faixa fixa no topo da tela (HP das torres + timer). Exportada
// para quem precisar posicionar HUD auxiliar (ex.: DiagnosticsOverlay) sem
// invadir a faixa.
export const TOP_ZONE_HEIGHT = 148;
const HEALTH_BAR_WIDTH = 168;
const HEALTH_BAR_HEIGHT = 26;

// Zona `thumb`: terco inferior da tela, onde vivem cogumelos + cartas.
// Exportada como fracao porque o `OffscreenIndicator` precisa dela para nao
// prender a seta em cima das cartas — antes ele mantinha uma copia do numero.
export const THUMB_ZONE_HEIGHT_FRACTION = 0.34;
const THUMB_ZONE_HEIGHT_PERCENT = `${THUMB_ZONE_HEIGHT_FRACTION * 100}%`;

const TIMER_COLOR = "#f8fafc";
const TIMER_WARNING_COLOR = "#fca5a5";
const TIMER_WARNING_THRESHOLD_MS = 60_000;

const HEALTH_COLOR: Record<TowerTeam, string> = {
  enemy: "#ef4444",
  player: "#38bdf8",
};

interface TowerHealthControls {
  container: Rectangle;
  fill: Rectangle;
  numberText: TextBlock;
}

/**
 * Camada unica de HUD compartilhada pelo deck de cartas, pelo gerenciador de
 * RA e pelo HUD de batalha (HP + timer). O layout e de RETRATO: a arena ocupa
 * o quadro inteiro e o HUD flutua sobre ela, confinado a duas zonas —
 * `top` (HP das torres + timer, com safe-area) e `thumb` (cogumelos + cartas,
 * terço inferior, zona do polegar). Nada de HUD de batalha fora dessas duas
 * zonas.
 *
 * O antigo modelo de "slots da barra superior esquerda" (paisagem) foi
 * removido: nao ha mais coluna lateral nem barra fixa de icones.
 */
export class HudLayer {
  /** Zonas de HUD em retrato. Nenhum controle de batalha vive fora delas. */
  public readonly zones: { top: Container; thumb: Container };

  private readonly texture: AdvancedDynamicTexture;

  // Texto de orientacao de posicionamento de RA. Fica FORA das duas zonas de
  // batalha de proposito: e um HUD de setup (antes da partida), nao de
  // batalha, e as duas fases nunca se sobrepoem (ver isBattleHudVisible).
  private readonly arStatusText: TextBlock;

  private readonly playerHealth: TowerHealthControls;
  private readonly enemyHealth: TowerHealthControls;
  private readonly timerText: TextBlock;
  private readonly arStatusBackground: Rectangle;

  private safeArea: SafeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };

  // `arStatusText` tem dois donos disputando visibilidade: o posicionamento de
  // RA (via `setArStatusVisible`, chamado pelo EighthWallARManager) e a fase
  // de batalha (via `setBattleHudVisible`, chamado pelo CardDeckHud a partir
  // do GameFlow). O texto de RA nunca aparece durante a partida — as duas
  // fases sao mutuamente exclusivas, entao a conjuncao dos dois basta.
  private isArPlacementStatusVisible = true;
  private isBattleHudVisible = false;

  public constructor(scene: Scene) {
    this.texture = AdvancedDynamicTexture.CreateFullscreenUI("game-hud", true, scene);
    this.texture.useSmallestIdeal = true;
    this.applyIdealResolution();

    const top = new Rectangle("hud-zone-top");
    top.width = "100%";
    top.height = `${TOP_ZONE_HEIGHT}px`;
    top.thickness = 0;
    top.background = "#00000000";
    top.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    top.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    top.isPointerBlocker = false;
    top.isVisible = false;
    this.texture.addControl(top);

    const thumb = new Rectangle("hud-zone-thumb");
    thumb.width = "100%";
    thumb.height = THUMB_ZONE_HEIGHT_PERCENT;
    thumb.thickness = 0;
    thumb.background = "#00000000";
    thumb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    thumb.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    thumb.isPointerBlocker = false;
    thumb.isVisible = false;
    this.texture.addControl(thumb);

    this.zones = { thumb, top };

    this.playerHealth = this.createTowerHealthControls("player", Control.HORIZONTAL_ALIGNMENT_LEFT);
    this.enemyHealth = this.createTowerHealthControls("enemy", Control.HORIZONTAL_ALIGNMENT_RIGHT);
    top.addControl(this.playerHealth.container);
    top.addControl(this.enemyHealth.container);

    this.timerText = new TextBlock("hud-match-timer", "");
    this.timerText.width = "220px";
    this.timerText.height = "48px";
    this.timerText.fontSize = 40;
    this.timerText.color = TIMER_COLOR;
    this.timerText.fontFamily = "Trebuchet MS";
    this.timerText.fontWeight = "bold";
    this.timerText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.timerText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.timerText.top = `${BASE_MARGIN}px`;
    this.timerText.isHitTestVisible = false;
    this.timerText.isVisible = false;
    top.addControl(this.timerText);

    this.arStatusText = new TextBlock("hud-ar-status", "");
    this.arStatusText.width = "86%";
    this.arStatusText.height = "150px";
    this.arStatusText.color = AR_STATUS_COLOR;
    this.arStatusText.fontSize = 40;
    this.arStatusText.fontFamily = "Trebuchet MS";
    this.arStatusText.textWrapping = true;
    this.arStatusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.arStatusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.arStatusText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.arStatusText.isHitTestVisible = false;

    // Fundo (placa de contraste) atras do texto de posicionamento de RA.
    // O texto vive em cima do feed da camera e precisa de contraste garantido
    // por fundo semi-opaco, nao por cor de fonte. A geometria acompanha o mesmo
    // sistema de safe-area que o texto ja usa.
    this.arStatusBackground = new Rectangle("hud-ar-status-bg");
    this.arStatusBackground.width = "90%";
    this.arStatusBackground.height = "160px";
    this.arStatusBackground.background = "#0f172acc";
    this.arStatusBackground.cornerRadius = 12;
    this.arStatusBackground.thickness = 0;
    this.arStatusBackground.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.arStatusBackground.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.arStatusBackground.isHitTestVisible = false;
    this.arStatusBackground.isPointerBlocker = false;
    this.texture.addControl(this.arStatusBackground);

    this.texture.addControl(this.arStatusText);

    this.refreshSafeArea();
  }

  public getTexture(): AdvancedDynamicTexture {
    return this.texture;
  }

  /**
   * Liga/desliga cogumelos + cartas + timer + HP de uma vez. O default e
   * escondido: fora da partida (menu, "mundo vivo") a tela precisa ficar
   * completamente limpa. Tambem forca o texto de posicionamento de RA a
   * sumir, ja que as duas fases nunca coexistem.
   */
  public setBattleHudVisible(isVisible: boolean): void {
    this.isBattleHudVisible = isVisible;
    this.zones.top.isVisible = isVisible;
    this.zones.thumb.isVisible = isVisible;
    this.refreshArStatusVisibility();
  }

  /** `null` esconde. Formato `M:SS`, destacado no ultimo minuto. */
  public setMatchTimer(remainingMs: number | null): void {
    if (remainingMs === null) {
      this.timerText.isVisible = false;
      return;
    }

    const clamped = Math.max(0, Math.round(remainingMs / 1000));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;

    this.timerText.text = `${minutes}:${String(seconds).padStart(2, "0")}`;
    this.timerText.isVisible = true;

    const isLastMinute = remainingMs <= TIMER_WARNING_THRESHOLD_MS;
    this.timerText.color = isLastMinute ? TIMER_WARNING_COLOR : TIMER_COLOR;
    this.timerText.fontSize = isLastMinute ? 48 : 40;
  }

  /** Barra grossa e opaca + numero. Uma de cada lado do topo. */
  public setTowerHealth(team: TowerTeam, current: number, max: number): void {
    const controls = team === "player" ? this.playerHealth : this.enemyHealth;
    const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, current / max));

    controls.fill.width = `${Math.round(ratio * 100)}%`;
    controls.numberText.text = `${Math.max(0, Math.round(current))}`;
  }

  /**
   * Reaplica as margens do HUD considerando o recorte da tela (notch). A
   * leitura dos insets mexe no DOM, entao o resultado fica em cache — isso
   * roda a cada `resize`.
   */
  public refreshSafeArea(): void {
    // Antes das margens: elas sao calculadas em px do espaco ideal, que pode
    // mudar com o tamanho da tela.
    this.applyIdealResolution();
    this.safeArea = readSafeAreaInsets();

    const scale = this.cssPixelToIdealPixel();
    this.zones.top.paddingTop = `${this.safeArea.top * scale}px`;
    this.zones.top.paddingLeft = `${BASE_MARGIN + this.safeArea.left * scale}px`;
    this.zones.top.paddingRight = `${BASE_MARGIN + this.safeArea.right * scale}px`;
    this.zones.thumb.paddingBottom = `${BASE_MARGIN + this.safeArea.bottom * scale}px`;
    this.zones.thumb.paddingLeft = `${this.safeArea.left * scale}px`;
    this.zones.thumb.paddingRight = `${this.safeArea.right * scale}px`;
    const arStatusTop = `${BASE_MARGIN + this.safeArea.top * scale}px`;
    this.arStatusText.top = arStatusTop;
    this.arStatusBackground.top = arStatusTop;
  }

  /**
   * Margem direita ja compensada pelo notch, em px do espaco ideal. Mantida
   * pela assinatura porque e uma das APIs que o EighthWallARManager depende
   * (indiretamente, via codigo que ainda possa consultar); o layout de
   * retrato nao tem mais coluna lateral, mas o valor continua correto para
   * quem precisar de uma margem direita coerente com a safe-area.
   */
  public getRightMargin(): number {
    return BASE_MARGIN + this.safeArea.right * this.cssPixelToIdealPixel();
  }

  /**
   * O texto de `setArStatus` e a orientacao de posicionamento durante o setup
   * de RA. Fica centralizado no topo e nunca aparece durante a partida (ver
   * `isBattleHudVisible`).
   */
  public setArStatus(text: string, isWarning = false): void {
    this.arStatusText.text = text;
    this.arStatusText.color = isWarning ? AR_STATUS_WARNING_COLOR : AR_STATUS_COLOR;
    // Reavalia a placa de fundo: ela depende do texto ter conteudo, entao
    // trocar o texto pode liga-la ou desliga-la.
    this.refreshArStatusVisibility();
  }

  public setArStatusVisible(visible: boolean): void {
    this.isArPlacementStatusVisible = visible;
    this.refreshArStatusVisibility();
  }

  /**
   * Antes controlava a barra de status de paisagem (RA + carta selecionada).
   * O GameFlow ainda chama isso nas transicoes de fase (`menu`/`playing`),
   * mas quem decide a visibilidade do HUD de batalha agora e
   * `setBattleHudVisible` (acionado pelo CardDeckHud) e a do status de RA e
   * `setArStatusVisible` (acionado pelo EighthWallARManager) — a chamada
   * continua segura de fazer, so que virou no-op.
   */
  public setStatusVisible(_isVisible: boolean): void {
    // Intencionalmente vazio — ver docblock.
  }

  /**
   * Insere um slot da antiga barra de paisagem. O unico chamador remanescente
   * e o EighthWallARManager, que so usa o slot "ar-scale" para se esconder —
   * no layout novo isso nao existe mais. No-op tolerante para nao quebrar o
   * build do AR Manager.
   */
  public setSlotVisible(_slot: string, _isVisible: boolean): void {
    // Intencionalmente vazio — ver docblock.
  }

  public dispose(): void {
    this.texture.dispose();
  }

  /**
   * Gira o espaco de referencia junto com a tela, para que o eixo curto valha
   * sempre IDEAL_SHORT e um controle de 80px tenha o mesmo tamanho fisico
   * independente do aparelho.
   */
  private applyIdealResolution(): void {
    const portrait = isPortrait();

    this.texture.idealWidth = portrait ? IDEAL_SHORT : IDEAL_LONG;
    this.texture.idealHeight = portrait ? IDEAL_LONG : IDEAL_SHORT;
  }

  /**
   * Converte px CSS para px do espaco ideal do HUD: a textura mede em px de
   * dispositivo e os valores dos controles sao multiplicados por `idealRatio`.
   */
  private cssPixelToIdealPixel(): number {
    const canvas = this.texture.getScene()?.getEngine().getRenderingCanvas();
    const ratio = this.texture.idealRatio;

    if (!canvas || !canvas.clientWidth || !ratio) {
      return 1;
    }

    return this.texture.getSize().width / canvas.clientWidth / ratio;
  }

  /**
   * A placa de fundo segue o texto — e tambem some quando o texto esta VAZIO.
   *
   * Sao dois defeitos que a placa introduziu e que so aparecem no device:
   *
   * 1. Ela nao era escondida junto com o texto. Depois de ancorar a arena o
   *    jogo entra em `world-alive`, que chama `setArStatusVisible(false)` — o
   *    texto sumia e o retangulo escuro ficava na tela pelo resto da sessao.
   *    O Beat 4 exige tela COMPLETAMENTE limpa: sem HUD, sem timer, sem
   *    prompt. Uma caixa preta flutuando sobre a mesa e o oposto disso.
   * 2. Mensagem vazia (`setArStatus("")`, usado entre estados do gate de
   *    posicionamento) deixava uma placa sem nada dentro. Fundo so faz sentido
   *    quando ha texto para contrastar.
   */
  private refreshArStatusVisibility(): void {
    const isVisible = this.isArPlacementStatusVisible && !this.isBattleHudVisible;

    this.arStatusText.isVisible = isVisible;
    this.arStatusBackground.isVisible = isVisible && this.arStatusText.text.length > 0;
  }

  private createTowerHealthControls(
    team: TowerTeam,
    align: number
  ): TowerHealthControls {
    const container = new Rectangle(`hud-health-${team}`);
    container.width = `${HEALTH_BAR_WIDTH}px`;
    container.height = "60px";
    container.thickness = 0;
    container.background = "#00000000";
    container.horizontalAlignment = align;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    container.isPointerBlocker = false;

    // Barra grossa e OPACA (sem alpha) para nao ficar translucida por
    // engano, e um contorno solido para ficar legivel mesmo em cima de fundo
    // claro.
    const track = new Rectangle(`hud-health-track-${team}`);
    track.width = `${HEALTH_BAR_WIDTH}px`;
    track.height = `${HEALTH_BAR_HEIGHT}px`;
    track.cornerRadius = 6;
    track.thickness = 3;
    track.color = "#0f172a";
    track.background = "#0f172ae6";
    track.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    track.isPointerBlocker = false;

    const fill = new Rectangle(`hud-health-fill-${team}`);
    fill.width = "100%";
    fill.height = "100%";
    fill.thickness = 0;
    fill.cornerRadius = 4;
    fill.background = HEALTH_COLOR[team];
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    fill.isPointerBlocker = false;
    track.addControl(fill);

    const numberText = new TextBlock(`hud-health-number-${team}`, "");
    numberText.width = `${HEALTH_BAR_WIDTH}px`;
    numberText.height = "26px";
    numberText.top = `${HEALTH_BAR_HEIGHT + 4}px`;
    numberText.color = "#f8fafc";
    numberText.fontSize = 30;
    numberText.fontFamily = "Trebuchet MS";
    numberText.fontWeight = "bold";
    numberText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    numberText.textHorizontalAlignment = align;
    numberText.isHitTestVisible = false;

    container.addControl(track);
    container.addControl(numberText);

    return { container, fill, numberText };
  }
}
