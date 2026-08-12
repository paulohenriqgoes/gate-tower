import { Control, TextBlock, type AdvancedDynamicTexture } from "@babylonjs/gui";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";

import { THUMB_ZONE_HEIGHT_FRACTION, type HudLayer } from "./HudLayer";

export interface OffscreenIndicatorOptions {
  hud: HudLayer;
  scene: Scene;
}

// Todo o calculo de posicionamento roda em unidades "ideais" do HudLayer (o
// mesmo espaco de referencia usado pelas strings "Npx" de HudLayer.ts e
// DiagnosticsOverlay.ts), nao em pixels reais da textura. Fazendo a projecao
// diretamente nesse espaco (viewport do Vector3.Project = idealWidth x
// idealHeight) evitamos ter que reconverter por idealRatio depois.
const EDGE_MARGIN = 48;

// Tamanho da seta em px ideais.
const ARROW_SIZE = 40;

// Respiro extra entre a seta e o topo da zona thumb, em px ideais.
const ABOVE_THUMB_GAP = 16;

const ARROW_COLOR = "#f8fafc";
const ARROW_TEXT = "▲"; // triangulo solido apontando para cima ("▲")

/**
 * Geometria pura de "onde a seta encosta na borda da tela", extraida para dar
 * para testar sem precisar renderizar nada.
 *
 * `projectedX`/`projectedY` sao o resultado bruto de uma projecao de camera
 * (podem estar fora do viewport, e podem estar com o sinal invertido se o
 * alvo estiver atras da camera — a divisao perspectiva por w negativo
 * espelha x/y pelo centro da tela). `isBehindCamera` e quem diz se esse
 * espelhamento aconteceu; quando true, a funcao desfaz o espelhamento antes
 * de calcular a direcao, senao a seta apontaria para o lado errado.
 *
 * Devolve `null` quando o alvo esta visivel (dentro do viewport e na frente
 * da camera) — nesse caso nao ha o que indicar.
 *
 * `bottomLimit` (default: `viewportHeight - margin`) permite empurrar o
 * limite inferior do retangulo de ancoragem para cima, usado pelo
 * OffscreenIndicator para nunca deixar a seta invadir a zona `thumb` do HUD.
 */
export function resolveEdgeAnchor(
  projectedX: number,
  projectedY: number,
  isBehindCamera: boolean,
  viewportWidth: number,
  viewportHeight: number,
  margin: number,
  bottomLimit: number = viewportHeight - margin
): { x: number; y: number; angleRad: number } | null {
  const isInsideViewport =
    projectedX >= 0 && projectedX <= viewportWidth && projectedY >= 0 && projectedY <= viewportHeight;

  if (!isBehindCamera && isInsideViewport) {
    return null;
  }

  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  let dx = projectedX - centerX;
  let dy = projectedY - centerY;

  // Alvo atras da camera: a projecao bruta espelhou x/y pelo centro da tela
  // (perspectiva dividindo por um w negativo). Desfaz o espelhamento para que
  // a seta aponte para o lado real do alvo, nao para o oposto.
  if (isBehindCamera) {
    dx = -dx;
    dy = -dy;
  }

  if (dx === 0 && dy === 0) {
    // Alvo exatamente no eixo da camera (na frente ou atras, sem componente
    // lateral): nao ha direcao lateral definida. Convenciona apontar para
    // cima em vez de deixar um angulo indefinido.
    dy = -1;
  }

  const xMin = margin;
  const xMax = Math.max(xMin, viewportWidth - margin);
  const yMin = margin;
  const yMax = Math.max(yMin, bottomLimit);

  // Intersecao do raio (centerX, centerY) + t * (dx, dy) com o retangulo
  // [xMin, xMax] x [yMin, yMax]: o menor t positivo que atinge alguma borda.
  const tx = dx > 0 ? (xMax - centerX) / dx : dx < 0 ? (xMin - centerX) / dx : Number.POSITIVE_INFINITY;
  const ty = dy > 0 ? (yMax - centerY) / dy : dy < 0 ? (yMin - centerY) / dy : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);

  const x = clamp(centerX + dx * t, xMin, xMax);
  const y = clamp(centerY + dy * t, yMin, yMax);
  const angleRad = Math.atan2(dy, dx);

  return { angleRad, x, y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Seta que gruda na borda da tela apontando para um ponto do mundo fora de
 * quadro (torre sob ataque, invocacao inimiga). Se monta sozinha na textura
 * do HUD, igual ao DiagnosticsOverlay — quem for disparar a seta so precisa
 * chamar `point()`, sem saber nada de GUI.
 *
 * Nao faz nenhum wiring de jogo: outra etapa decide QUANDO chamar `point()`.
 */
export class OffscreenIndicator {
  private readonly scene: Scene;
  private readonly texture: AdvancedDynamicTexture;
  private readonly arrow: TextBlock;
  private readonly beforeRenderObserver: Observer<Scene>;

  // Alvo atual, copiado (nunca a referencia recebida em `point()`) para um
  // campo reutilizado a cada frame — sem alocar Vector3 no caminho quente.
  private readonly targetPosition = new Vector3();
  private isTargetActive = false;
  private expiresAtMs = 0;

  // Scratch reutilizado a cada frame do onBeforeRenderObservable.
  private readonly scratchTransform = new Matrix();
  private readonly scratchViewport = new Viewport(0, 0, 1, 1);
  private readonly scratchProjected = new Vector3();

  public constructor(options: OffscreenIndicatorOptions) {
    this.scene = options.scene;
    this.texture = options.hud.getTexture();

    this.arrow = new TextBlock("offscreen-indicator-arrow", ARROW_TEXT);
    this.arrow.width = `${ARROW_SIZE}px`;
    this.arrow.height = `${ARROW_SIZE}px`;
    this.arrow.fontSize = ARROW_SIZE;
    this.arrow.color = ARROW_COLOR;
    this.arrow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.arrow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.arrow.transformCenterX = 0.5;
    this.arrow.transformCenterY = 0.5;
    // Nunca pode roubar toque do jogo: e um indicador so-leitura sobre o HUD.
    this.arrow.isPointerBlocker = false;
    this.arrow.isHitTestVisible = false;
    this.arrow.isVisible = false;
    this.texture.addControl(this.arrow);

    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => this.update());
  }

  /** Aponta para um ponto do mundo por `durationMs`. Chamar de novo substitui o alvo. */
  public point(worldPosition: Vector3, durationMs: number): void {
    this.targetPosition.copyFrom(worldPosition);
    this.expiresAtMs = performance.now() + Math.max(0, durationMs);
    this.isTargetActive = true;
  }

  public clear(): void {
    this.isTargetActive = false;
    this.arrow.isVisible = false;
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
    this.arrow.dispose();
  }

  private update(): void {
    if (!this.isTargetActive) {
      return;
    }

    if (performance.now() >= this.expiresAtMs) {
      this.clear();
      return;
    }

    // Em RA a camera ativa e a FreeCamera controlada pelo 8th Wall, com a
    // matriz de projecao injetada e congelada por frame pelo WASM. Nunca
    // assumir a camera do modo tela — sempre ler `scene.activeCamera`.
    const camera = this.scene.activeCamera;

    if (!camera) {
      this.arrow.isVisible = false;
      return;
    }

    const idealWidth = this.texture.idealWidth || this.texture.getSize().width;
    const idealHeight = this.texture.idealHeight || this.texture.getSize().height;

    // Projeta diretamente no espaco ideal (viewport = idealWidth x
    // idealHeight) para que o resultado ja saia nas mesmas unidades usadas
    // pelos controles do HUD, sem reconverter por idealRatio depois.
    camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), this.scratchTransform);
    this.scratchViewport.x = 0;
    this.scratchViewport.y = 0;
    this.scratchViewport.width = idealWidth;
    this.scratchViewport.height = idealHeight;

    Vector3.ProjectToRef(
      this.targetPosition,
      Matrix.IdentityReadOnly,
      this.scratchTransform,
      this.scratchViewport,
      this.scratchProjected
    );

    // z < 0 e o mesmo criterio que o proprio Babylon GUI usa (ver
    // AdvancedDynamicTexture._checkUpdate) para "antes do near plane" — o
    // caso que praticamente todo mundo esquece de tratar: um ponto atras da
    // camera projeta x/y com sinal invertido (perspectiva dividindo por w
    // negativo), entao nao da para confiar so em "esta dentro do viewport".
    const isBehindCamera = this.scratchProjected.z < 0;

    const bottomLimit = Math.max(
      idealHeight / 2,
      idealHeight * (1 - THUMB_ZONE_HEIGHT_FRACTION) - ABOVE_THUMB_GAP
    );

    const anchor = resolveEdgeAnchor(
      this.scratchProjected.x,
      this.scratchProjected.y,
      isBehindCamera,
      idealWidth,
      idealHeight,
      EDGE_MARGIN,
      bottomLimit
    );

    if (!anchor) {
      this.arrow.isVisible = false;
      return;
    }

    this.arrow.isVisible = true;
    this.arrow.left = `${anchor.x - ARROW_SIZE / 2}px`;
    this.arrow.top = `${anchor.y - ARROW_SIZE / 2}px`;
    // O glyph "▲" aponta para cima em repouso (angulo -PI/2 na convencao
    // atan2(dy, dx) usada por resolveEdgeAnchor); soma PI/2 para alinhar com
    // a direcao do alvo.
    this.arrow.rotation = anchor.angleRad + Math.PI / 2;
  }
}
