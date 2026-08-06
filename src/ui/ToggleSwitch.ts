import { Control, Ellipse, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

const TRACK_WIDTH = 74;
const TRACK_HEIGHT = 36;
const KNOB_SIZE = 28;
const KNOB_MARGIN = 4;
const SLIDE_DURATION_MS = 150;

const TRACK_OFF = "#374151";
const TRACK_ON = "#216e39";
const TRACK_WARNING = "#7c2d12";

/**
 * Switch liga/desliga (trilho + bolinha deslizante). O Babylon GUI nao traz um
 * controle equivalente — `ToggleButton` e apenas um retangulo de dois estados —
 * entao ele e composto por um `Rectangle` em formato de pilula e uma `Ellipse`
 * que desliza animando `left`.
 */
export class ToggleSwitch {
  public readonly root: StackPanel;
  public readonly onToggleObservable = new Observable<boolean>();

  private readonly track: Rectangle;
  private readonly knob: Ellipse;
  private readonly label: TextBlock;

  private isOn = false;
  private isEnabled = true;
  private knobTarget = KNOB_MARGIN;
  private knobCurrent = KNOB_MARGIN;

  public constructor(scene: Scene, name: string, labelText: string) {
    this.root = new StackPanel(`${name}-root`);
    this.root.isVertical = false;
    this.root.height = `${TRACK_HEIGHT}px`;
    this.root.spacing = 8;
    this.root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.root.isPointerBlocker = false;

    this.track = new Rectangle(`${name}-track`);
    this.track.width = `${TRACK_WIDTH}px`;
    this.track.height = `${TRACK_HEIGHT}px`;
    this.track.cornerRadius = TRACK_HEIGHT / 2;
    this.track.thickness = 2;
    this.track.color = "#94a3b8";
    this.track.background = TRACK_OFF;
    this.track.isPointerBlocker = true;

    this.knob = new Ellipse(`${name}-knob`);
    this.knob.width = `${KNOB_SIZE}px`;
    this.knob.height = `${KNOB_SIZE}px`;
    this.knob.thickness = 0;
    this.knob.background = "#f8fafc";
    this.knob.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.knob.left = `${KNOB_MARGIN}px`;
    this.knob.isHitTestVisible = false;

    this.label = new TextBlock(`${name}-label`, labelText);
    this.label.width = "44px";
    this.label.height = `${TRACK_HEIGHT}px`;
    this.label.color = "#e2e8f0";
    this.label.fontSize = 20;
    this.label.fontFamily = "Trebuchet MS";
    this.label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.label.isHitTestVisible = false;

    this.track.addControl(this.knob);
    this.root.addControl(this.track);
    this.root.addControl(this.label);

    this.track.onPointerClickObservable.add(() => {
      if (!this.isEnabled) {
        return;
      }

      this.onToggleObservable.notifyObservers(!this.isOn);
    });

    scene.onBeforeRenderObservable.add(() => {
      this.animateKnob(scene.getEngine().getDeltaTime());
    });
  }

  /** Reflete o estado real do modo RA (o dono do estado e quem chama). */
  public setState(isOn: boolean): void {
    this.isOn = isOn;
    this.knobTarget = isOn ? TRACK_WIDTH - KNOB_SIZE - KNOB_MARGIN : KNOB_MARGIN;
    this.refreshTrackColor();
  }

  public setEnabled(isEnabled: boolean): void {
    this.isEnabled = isEnabled;
    this.root.alpha = isEnabled ? 1 : 0.4;
  }

  public setWarning(isWarning: boolean): void {
    this.track.background = isWarning ? TRACK_WARNING : this.isOn ? TRACK_ON : TRACK_OFF;
  }

  private refreshTrackColor(): void {
    this.track.background = this.isOn ? TRACK_ON : TRACK_OFF;
  }

  private animateKnob(deltaMs: number): void {
    if (Math.abs(this.knobTarget - this.knobCurrent) < 0.5) {
      return;
    }

    const step = (this.knobTarget - this.knobCurrent) * Math.min(1, deltaMs / SLIDE_DURATION_MS);
    this.knobCurrent += step;
    this.knob.left = `${this.knobCurrent}px`;
  }
}
