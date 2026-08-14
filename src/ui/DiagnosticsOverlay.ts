import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { Control, Rectangle, TextBlock } from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core/scene";

import { TOP_ZONE_HEIGHT, type HudLayer } from "./HudLayer";
import { isFullscreen, onOrientationChange } from "./screenOrientation";

const FONT_SIZE = 13;
const PANEL_MARGIN = 12;
const PANEL_PADDING = 8;
const BACKGROUND_COLOR = "#000000b3";
const TEXT_COLOR = "#e2e8f0";

// Os campos de viewport sao relidos em ritmo proprio, e nao so no
// `onOrientationChange`: em RA o canvas muda de tamanho por caminhos que nao
// emitem evento nenhum (o engine do 8th Wall mexe no canvas por conta propria,
// e `main.ts` pula o `engine.resize()` com a sessao no ar). Se o painel so
// atualizasse por evento, ele mostraria numeros velhos justamente no cenario
// que estamos investigando.
const VIEWPORT_REFRESH_INTERVAL_MS = 500;

// Divergencia em px CSS a partir da qual o descompasso deixa de ser
// arredondamento e passa a deslocar o toque de forma perceptivel.
const DESYNC_TOLERANCE_PX = 2;

// Teto de caracteres por valor. Ver o docblock de `render` — um valor comprido
// sozinho e capaz de empurrar o painel inteiro para fora da tela.
const MAX_FIELD_VALUE_CHARS = 34;

/**
 * Painel de debug em tela: viewport, orientacao e tracking. So existe atras
 * de `?debug=1` porque o celular nao tem console acessivel para conferir
 * esses numeros durante os testes de RA.
 *
 * Fica ancorado no canto superior direito, mas ABAIXO de `TOP_ZONE_HEIGHT`
 * (a faixa de HP/timer do HUD de batalha) para nunca invadir a zona `top` nem
 * a zona `thumb` (terço inferior) do `HudLayer` — o painel de debug e uma
 * ferramenta de teste, nao faz parte do HUD minimo de batalha.
 */
export class DiagnosticsOverlay {
  private readonly scene: Scene;
  private readonly hud: HudLayer;
  private readonly fields = new Map<string, string>();
  private readonly container: Rectangle;
  private readonly textBlock: TextBlock;
  private readonly unsubscribeOrientation: () => void;
  private readonly prePointerObserver: Observer<unknown>;
  private readonly refreshObserver: Observer<unknown>;

  private lastViewportRefreshMs = 0;

  /** true quando a URL tem `?debug=1`. Checar ANTES de instanciar. */
  public static isEnabled(): boolean {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }

  public constructor(hud: HudLayer, scene: Scene) {
    this.scene = scene;
    this.hud = hud;

    this.container = new Rectangle("diagnostics-overlay");
    this.container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.container.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.container.adaptWidthToChildren = true;
    this.container.adaptHeightToChildren = true;
    this.container.thickness = 0;
    this.container.cornerRadius = 6;
    this.container.background = BACKGROUND_COLOR;
    this.container.paddingLeft = `${PANEL_PADDING}px`;
    this.container.paddingRight = `${PANEL_PADDING}px`;
    this.container.paddingTop = `${PANEL_PADDING}px`;
    this.container.paddingBottom = `${PANEL_PADDING}px`;
    this.container.left = `${-PANEL_MARGIN}px`;
    // Comeca logo abaixo da faixa de HP/timer, nunca dentro dela.
    this.container.top = `${TOP_ZONE_HEIGHT + PANEL_MARGIN}px`;
    // Nunca pode roubar toque do jogo: e um painel so-leitura sobre o HUD.
    this.container.isHitTestVisible = false;
    this.container.isPointerBlocker = false;

    this.textBlock = new TextBlock("diagnostics-overlay-text", "");
    this.textBlock.fontFamily = "ui-monospace, monospace";
    this.textBlock.fontSize = FONT_SIZE;
    this.textBlock.color = TEXT_COLOR;
    this.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.textBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.textBlock.textWrapping = false;
    this.textBlock.resizeToFit = true;
    this.textBlock.isHitTestVisible = false;
    this.textBlock.isPointerBlocker = false;
    this.container.addControl(this.textBlock);

    hud.getTexture().addControl(this.container);

    this.unsubscribeOrientation = onOrientationChange(() => this.refreshViewportFields());

    this.prePointerObserver = this.installTapProbe();
    this.refreshObserver = this.scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();

      if (now - this.lastViewportRefreshMs < VIEWPORT_REFRESH_INTERVAL_MS) {
        return;
      }

      this.lastViewportRefreshMs = now;
      this.refreshViewportFields();
    });

    this.refreshViewportFields();
  }

  /** Campo avulso (ex.: "trackingStatus" -> "NORMAL"). Sobrescreve o anterior. */
  public setField(key: string, value: string): void {
    this.fields.set(key, value);
    this.render();
  }

  public setFields(fields: Record<string, string>): void {
    for (const [key, value] of Object.entries(fields)) {
      this.fields.set(key, value);
    }
    this.render();
  }

  /**
   * Recalcula sozinho o que da para ler do DOM/engine. Idempotente — chamada
   * a cada `onOrientationChange` e tambem em ritmo proprio (ver
   * `VIEWPORT_REFRESH_INTERVAL_MS`).
   */
  public refreshViewportFields(): void {
    const engine = this.scene.getEngine();
    const canvas = engine.getRenderingCanvas();
    const orientation = window.screen?.orientation;
    const hardwareScaling = engine.getHardwareScalingLevel();
    const textureSize = this.hud.getTexture().getSize();

    this.setFields({
      orientation: orientation ? `${orientation.type} ${orientation.angle}deg` : "n/a",
      canvasCss: canvas ? `${canvas.clientWidth}x${canvas.clientHeight}` : "n/a",
      canvasPx: canvas ? `${canvas.width}x${canvas.height}` : "n/a",
      render: `${engine.getRenderWidth()}x${engine.getRenderHeight()}`,
      hwScaling: hardwareScaling.toFixed(3),
      hudTex: `${Math.round(textureSize.width)}x${Math.round(textureSize.height)}`,
      idealRatio: this.hud.getTexture().idealRatio.toFixed(3),
      statusPx: this.measureArStatusCssPx(),
      // O VEREDITO da Etapa 0: se isto vier "SIM", o toque esta sendo mapeado
      // contra um tamanho de canvas que nao e mais o real, e e por isso que a
      // carta nao responde em RA/tela cheia.
      desync: this.describeDesync(),
      canvasAspect:
        canvas && canvas.clientHeight
          ? (canvas.clientWidth / canvas.clientHeight).toFixed(2)
          : "n/a",
      fullscreen: String(isFullscreen()),
      dpr: String(window.devicePixelRatio),
    });
  }

  public dispose(): void {
    this.unsubscribeOrientation();
    this.scene.onPrePointerObservable.remove(this.prePointerObserver);
    this.scene.onBeforeRenderObservable.remove(this.refreshObserver);
    // Container.dispose() descarta os filhos (o TextBlock) e se remove da textura.
    this.container.dispose();
  }

  /**
   * Sonda de toque so-leitura. NAO viola a regra de que o `WorldTapRouter` e o
   * dono unico do toque: aquela regra existe para que so UM lugar DECIDA o que
   * o toque faz, e esta sonda nao decide nada — ela observa e nunca consome.
   *
   * Assina `onPrePointerObservable` (e nao `onPointerObservable`) de proposito:
   * e o unico ponto onde o evento ainda aparece MESMO quando o GUI o consome.
   * O `AdvancedDynamicTexture` do `HudLayer` e construido antes deste overlay
   * (ver `main.ts`), entao o observer dele ja rodou quando o nosso roda — logo
   * `skipOnPointerObservable` ja carrega a decisao do GUI. E exatamente esse
   * bit que separa as duas hipoteses:
   *
   * - `gui=SIM` com o dedo em cima de uma carta -> o GUI pegou; o problema e
   *   outro (fase, handler, estado da carta);
   * - `gui=NAO` com o dedo em cima de uma carta -> o GUI errou o alvo, que e o
   *   sintoma previsto pelo descompasso de tamanho.
   *
   * O `pick3d` ao lado mostra o que o raio de picking 3D acertou com as MESMAS
   * coordenadas — se ele acusar uma mesh que nao esta debaixo do dedo, o raio
   * esta deslocado, e o Beat 5 e a carta compartilham a mesma causa.
   */
  private installTapProbe(): Observer<unknown> {
    return this.scene.onPrePointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
        return;
      }

      const x = Math.round(this.scene.pointerX);
      const y = Math.round(this.scene.pointerY);
      const guiConsumed = pointerInfo.skipOnPointerObservable ? "SIM" : "NAO";
      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);

      this.setFields({
        tap: `${x},${y} gui=${guiConsumed}`,
        pick3d: pick?.hit ? (pick.pickedMesh?.name ?? "?") : "nada",
      });
    });
  }

  /**
   * `fontSize` do texto de status de RA em px CSS de verdade — o numero que
   * decide se ele e legivel no device. O valor autorado passa por dois fatores
   * antes de virar pixel na tela: o `idealRatio` do GUI e a razao entre a
   * textura e o canvas CSS. Ler o resultado final e mais barato que refazer a
   * conta a cada ajuste.
   */
  private measureArStatusCssPx(): string {
    const texture = this.hud.getTexture();
    const control = texture.getControlByName("hud-ar-status");
    const canvas = this.scene.getEngine().getRenderingCanvas();
    const textureWidth = texture.getSize().width;

    if (!control || !canvas || !textureWidth) {
      return "n/a";
    }

    return (control.fontSizeInPixels * (canvas.clientWidth / textureWidth)).toFixed(1);
  }

  /**
   * Compara o tamanho CSS do canvas com o tamanho que o engine acha que esta
   * renderizando. Sao esses dois numeros que o Babylon mistura para converter
   * o toque em coordenada de picking — divergiram, o toque cai no lugar
   * errado, e a divergencia cresce conforme se desce na tela (por isso a
   * fileira de cartas, no terco inferior, e a primeira a parar de responder).
   */
  private describeDesync(): string {
    const engine = this.scene.getEngine();
    const canvas = engine.getRenderingCanvas();

    if (!canvas) {
      return "n/a";
    }

    const hardwareScaling = engine.getHardwareScalingLevel();
    const expectedWidth = engine.getRenderWidth() * hardwareScaling;
    const expectedHeight = engine.getRenderHeight() * hardwareScaling;
    const deltaWidth = canvas.clientWidth - expectedWidth;
    const deltaHeight = canvas.clientHeight - expectedHeight;

    if (Math.abs(deltaWidth) <= DESYNC_TOLERANCE_PX && Math.abs(deltaHeight) <= DESYNC_TOLERANCE_PX) {
      return "nao";
    }

    return `SIM ${deltaWidth.toFixed(0)},${deltaHeight.toFixed(0)}px`;
  }

  /**
   * Renderiza `chave: valor` por linha, na ordem de insercao do Map.
   *
   * Valor longo e TRUNCADO. Sem isso, um unico campo comprido destroi o painel
   * inteiro: `textWrapping` esta desligado e `resizeToFit` ligado, entao a
   * linha mais larga define a largura do container e empurra todo o resto para
   * fora da tela. Foi o que aconteceu no device em 2026-08-14 — um campo com
   * uma lista de chaves separadas por virgula ocupou a largura toda e escondeu
   * justamente os numeros que a sessao existia para ler.
   */
  private render(): void {
    const lines: string[] = [];

    for (const [key, value] of this.fields) {
      const trimmed =
        value.length > MAX_FIELD_VALUE_CHARS
          ? `${value.slice(0, MAX_FIELD_VALUE_CHARS - 1)}…`
          : value;
      lines.push(`${key}: ${trimmed}`);
    }

    this.textBlock.text = lines.join("\n");
  }
}
