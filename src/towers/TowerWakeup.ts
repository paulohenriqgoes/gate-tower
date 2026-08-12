import { Animation } from "@babylonjs/core/Animations/animation";
import { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  AdvancedDynamicTexture,
  Control,
  Rectangle,
  TextBlock,
} from "@babylonjs/gui";

import { CARD_CATALOG } from "../cards/cardCatalog";

const FPS = 60;

// Duracao do "acordar" da torre (a spec pede 1,2 a 1,8 s).
const WAKE_DURATION_MS = 1300;
// A carta entra depois do primeiro tranco, quando o olhar ja foi para a torre.
const REVEAL_DELAY_MS = 350;
// Tempo total da carta em tela, incluindo as duas transicoes de alpha. O miolo
// legivel (alpha 1) fica em ~1,5 s, que e o que a spec pede.
const REVEAL_DURATION_MS = 1900;
const REVEAL_FADE_IN_MS = 180;
const REVEAL_FADE_OUT_MS = 220;

// Vibracao curta em tres tempos ("tum-ta-tum"), como o toque acordando a
// torre. `navigator.vibrate` nao existe no iOS Safari — a ausencia e tratada.
const WAKE_VIBRATION_PATTERN = [22, 60, 34];

const REVEAL_PANEL_WIDTH = 360;
const REVEAL_PANEL_HEIGHT = 176;

/**
 * Beat 5 da demo: a torre inimiga acorda ao ser tocada e revela uma das cartas
 * que a IA vai usar. E o gesto que inicia a batalha — nao existe botao de
 * "comecar" em lugar nenhum.
 *
 * Escala: em RA a arena inteira roda com `AR_ARENA_SCALE` (~0.033), entao
 * NENHUMA animacao daqui pode ser autorada em deslocamento absoluto — ela
 * sumiria (ou explodiria) conforme a escala do root. Tudo aqui e relativo:
 * `scaling` e sempre multiplicado pela escala que a torre ja tem, a sacudida e
 * uma ROTACAO (invariante a escala) e o pulso e uma cor emissiva (idem). O
 * resultado tem a mesma leitura na mesa de 80 cm e no modo tela.
 *
 * A carta revelada e um parametro: a demo tem uma IA scriptada (etapa
 * posterior), e quem sabe qual e a primeira carta do script e ela — aqui so
 * mostramos o id recebido.
 */
export class TowerWakeup {
  private readonly scene: Scene;

  // Material clonado por mesh: o material da torre vem do cache de
  // `createMatteMaterial` (compartilhado por cor), e animar o emissivo dele
  // direto mancharia qualquer outro objeto que use a mesma cor.
  private readonly pulseMaterials = new Map<Mesh, StandardMaterial>();
  private readonly pendingTimeouts = new Set<number>();

  private revealTexture: AdvancedDynamicTexture | null = null;
  private revealPanel: Rectangle | null = null;
  private revealTitle: TextBlock | null = null;
  private revealCost: TextBlock | null = null;
  private revealAccent: Rectangle | null = null;

  private activePlay: Promise<void> | null = null;
  private resolveActivePlay: (() => void) | null = null;
  private isDisposed = false;

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Toca o "acordar" e a revelacao da carta. Resolve quando a cena voltou ao
   * repouso — quem chama so entra em `playing` depois disso.
   */
  public play(towerMesh: Mesh, revealedCardId: string): Promise<void> {
    if (this.isDisposed) {
      return Promise.resolve();
    }

    // Toque repetido durante a animacao nao empilha um segundo "acordar".
    if (this.activePlay) {
      return this.activePlay;
    }

    this.vibrate();
    this.animateTower(towerMesh);
    this.schedule(() => this.showReveal(revealedCardId), REVEAL_DELAY_MS);

    const totalMs = Math.max(WAKE_DURATION_MS, REVEAL_DELAY_MS + REVEAL_DURATION_MS);

    this.activePlay = new Promise<void>((resolve) => {
      this.resolveActivePlay = resolve;
      this.schedule(() => this.finishPlay(), totalMs);
    });

    return this.activePlay;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    // Quem estava esperando o beat terminar nao pode ficar pendurado para
    // sempre porque a cena foi descartada no meio da animacao.
    this.finishPlay();

    for (const timeoutId of this.pendingTimeouts) {
      window.clearTimeout(timeoutId);
    }
    this.pendingTimeouts.clear();

    for (const material of this.pulseMaterials.values()) {
      material.dispose();
    }
    this.pulseMaterials.clear();

    this.revealTexture?.dispose();
    this.revealTexture = null;
    this.revealPanel = null;
    this.revealTitle = null;
    this.revealCost = null;
    this.revealAccent = null;
  }

  /** Encerra o beat: esconde a carta e libera quem esperava a promessa. */
  private finishPlay(): void {
    this.hideReveal();

    const resolve = this.resolveActivePlay;
    this.resolveActivePlay = null;
    this.activePlay = null;
    resolve?.();
  }

  /**
   * Sacudida + respiracao + pulso de emissivo, todos em unidades relativas.
   * A `scaling` alvo e sempre um multiplo da escala ATUAL da torre (capturada
   * na hora), entao a animacao nao presume nenhuma escala de mundo.
   */
  private animateTower(towerMesh: Mesh): void {
    const totalFrames = Math.round((WAKE_DURATION_MS / 1000) * FPS);
    const baseScale = towerMesh.scaling.clone();
    const scaleBy = (x: number, y: number, z: number): Vector3 =>
      new Vector3(baseScale.x * x, baseScale.y * y, baseScale.z * z);

    // Squash-and-stretch: a torre "respira fundo" ao acordar.
    const scaling = new Animation(
      "tower-wakeup-scaling",
      "scaling",
      FPS,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    scaling.setKeys([
      { frame: 0, value: baseScale.clone() },
      { frame: Math.round(totalFrames * 0.18), value: scaleBy(1.14, 0.84, 1.14) },
      { frame: Math.round(totalFrames * 0.42), value: scaleBy(0.92, 1.16, 0.92) },
      { frame: Math.round(totalFrames * 0.7), value: scaleBy(1.05, 0.96, 1.05) },
      { frame: totalFrames, value: baseScale.clone() },
    ]);
    scaling.setEasingFunction(this.createEase());

    // Sacudida em ROTACAO: nao tem unidade de comprimento, entao e imune a
    // escala do arenaRoot em RA. `rotation` (nao `rotationQuaternion`) porque
    // e assim que as torres do ArenaSystem sao criadas.
    const baseYaw = towerMesh.rotation.y;
    const yaw = new Animation(
      "tower-wakeup-yaw",
      "rotation.y",
      FPS,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    yaw.setKeys([
      { frame: 0, value: baseYaw },
      { frame: Math.round(totalFrames * 0.16), value: baseYaw + 0.16 },
      { frame: Math.round(totalFrames * 0.36), value: baseYaw - 0.13 },
      { frame: Math.round(totalFrames * 0.58), value: baseYaw + 0.07 },
      { frame: Math.round(totalFrames * 0.8), value: baseYaw - 0.03 },
      { frame: totalFrames, value: baseYaw },
    ]);
    yaw.setEasingFunction(this.createEase());

    this.scene.beginDirectAnimation(towerMesh, [scaling, yaw], 0, totalFrames, false);

    this.animateEmissivePulse(towerMesh, totalFrames);
  }

  /** Pulso de brilho na propria cor da torre, em um material clonado por mesh. */
  private animateEmissivePulse(towerMesh: Mesh, totalFrames: number): void {
    const material = this.resolvePulseMaterial(towerMesh);

    if (!material) {
      return;
    }

    const rest = Color3.Black();
    const peak = material.diffuseColor.scale(0.85);

    const emissive = new Animation(
      "tower-wakeup-emissive",
      "emissiveColor",
      FPS,
      Animation.ANIMATIONTYPE_COLOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    emissive.setKeys([
      { frame: 0, value: rest },
      { frame: Math.round(totalFrames * 0.22), value: peak },
      { frame: Math.round(totalFrames * 0.52), value: peak.scale(0.35) },
      { frame: Math.round(totalFrames * 0.72), value: peak.scale(0.8) },
      { frame: totalFrames, value: rest },
    ]);
    emissive.setEasingFunction(this.createEase());

    this.scene.beginDirectAnimation(material, [emissive], 0, totalFrames, false);
  }

  private resolvePulseMaterial(towerMesh: Mesh): StandardMaterial | null {
    const cached = this.pulseMaterials.get(towerMesh);
    if (cached) {
      return cached;
    }

    const source = towerMesh.material;
    if (!(source instanceof StandardMaterial)) {
      return null;
    }

    const clone = source.clone(`${source.name}-wakeup`);
    if (!clone) {
      return null;
    }

    clone.emissiveColor = Color3.Black();
    towerMesh.material = clone;
    this.pulseMaterials.set(towerMesh, clone);

    return clone;
  }

  private createEase(): CubicEase {
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    return ease;
  }

  /**
   * Carta revelada. Vive numa textura de GUI propria, criada sob demanda e
   * descartada no `dispose`: em `world-alive` a tela precisa ficar
   * completamente limpa, entao nada disso pode existir montado no HUD de jogo
   * antes da hora.
   */
  private showReveal(revealedCardId: string): void {
    const card = CARD_CATALOG.find((entry) => entry.id === revealedCardId);

    if (!card) {
      console.warn(`[TowerWakeup] Carta revelada desconhecida: ${revealedCardId}`);
      return;
    }

    this.ensureRevealUI();

    if (!this.revealPanel || !this.revealTitle || !this.revealCost || !this.revealAccent) {
      return;
    }

    this.revealTitle.text = card.name;
    this.revealCost.text = `\u{1F344} ${card.cost}`;
    this.revealAccent.background = card.accentColor;
    this.revealPanel.isVisible = true;

    const totalFrames = Math.round((REVEAL_DURATION_MS / 1000) * FPS);
    const fadeInFrames = Math.round((REVEAL_FADE_IN_MS / 1000) * FPS);
    const fadeOutFrames = Math.round((REVEAL_FADE_OUT_MS / 1000) * FPS);

    const alpha = new Animation(
      "tower-wakeup-reveal-alpha",
      "alpha",
      FPS,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    alpha.setKeys([
      { frame: 0, value: 0 },
      { frame: fadeInFrames, value: 1 },
      { frame: totalFrames - fadeOutFrames, value: 1 },
      { frame: totalFrames, value: 0 },
    ]);

    this.revealPanel.alpha = 0;
    this.scene.beginDirectAnimation(this.revealPanel, [alpha], 0, totalFrames, false);
  }

  private hideReveal(): void {
    if (this.revealPanel) {
      this.revealPanel.isVisible = false;
    }
  }

  private ensureRevealUI(): void {
    if (this.revealTexture) {
      return;
    }

    const texture = AdvancedDynamicTexture.CreateFullscreenUI("tower-wakeup-ui", true, this.scene);
    texture.useSmallestIdeal = true;
    texture.idealWidth = 720;
    texture.idealHeight = 1280;

    const panel = new Rectangle("tower-wakeup-reveal");
    panel.width = `${REVEAL_PANEL_WIDTH}px`;
    panel.height = `${REVEAL_PANEL_HEIGHT}px`;
    panel.cornerRadius = 18;
    panel.thickness = 2;
    panel.color = "#f8fafc40";
    panel.background = "#0b1220e6";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    // Puramente narrativo: nunca rouba o toque do mundo.
    panel.isHitTestVisible = false;
    panel.isPointerBlocker = false;
    panel.isVisible = false;

    const accent = new Rectangle("tower-wakeup-reveal-accent");
    accent.width = "100%";
    accent.height = "8px";
    accent.thickness = 0;
    accent.background = "#f8fafc";
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    accent.isHitTestVisible = false;
    panel.addControl(accent);

    const caption = new TextBlock("tower-wakeup-reveal-caption", "A torre inimiga vai usar");
    caption.width = "100%";
    caption.height = "34px";
    caption.color = "#cbd5e1";
    caption.fontSize = 20;
    caption.fontFamily = "Trebuchet MS";
    caption.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    caption.top = "26px";
    caption.isHitTestVisible = false;
    panel.addControl(caption);

    const title = new TextBlock("tower-wakeup-reveal-title", "");
    title.width = "94%";
    title.height = "52px";
    title.color = "#f8fafc";
    title.fontSize = 34;
    title.fontFamily = "Trebuchet MS";
    title.fontWeight = "bold";
    title.textWrapping = true;
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    title.top = "6px";
    title.isHitTestVisible = false;
    panel.addControl(title);

    const cost = new TextBlock("tower-wakeup-reveal-cost", "");
    cost.width = "100%";
    cost.height = "34px";
    cost.color = "#d8b4fe";
    cost.fontSize = 24;
    cost.fontFamily = "Trebuchet MS";
    cost.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    cost.top = "-20px";
    cost.isHitTestVisible = false;
    panel.addControl(cost);

    texture.addControl(panel);

    this.revealTexture = texture;
    this.revealPanel = panel;
    this.revealAccent = accent;
    this.revealTitle = title;
    this.revealCost = cost;
  }

  /**
   * Feedback tatil do toque que acorda a torre. O
   * `.github/copilot-instructions.md` pede vibracao e som posicional nas
   * interacoes de combate; som ainda nao existe no projeto (nenhum modulo de
   * audio foi montado ate aqui), e vibracao e barata. `navigator.vibrate` nao
   * existe no iOS Safari — sem API, o beat simplesmente segue sem tatil.
   */
  private vibrate(): void {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }

    try {
      navigator.vibrate(WAKE_VIBRATION_PATTERN);
    } catch (error) {
      console.warn("[TowerWakeup] Vibracao indisponivel.", error);
    }
  }

  private schedule(action: () => void, delayMs: number): number {
    const timeoutId = window.setTimeout(() => {
      this.pendingTimeouts.delete(timeoutId);

      if (this.isDisposed) {
        return;
      }

      action();
    }, delayMs);

    this.pendingTimeouts.add(timeoutId);

    return timeoutId;
  }
}
