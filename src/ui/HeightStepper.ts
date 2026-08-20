import { Button, Control, StackPanel, TextBlock } from "@babylonjs/gui";
import { Observable } from "@babylonjs/core/Misc/observable";

import { formatPlayerHeightM, normalizePlayerHeightM, stepPlayerHeightM } from "../ar/playerHeight";

// Alvo de toque. O espaco ideal do HUD vale ~0.54 px CSS por px autorado em
// celular, entao um botao precisa de ~82px aqui para chegar aos 44px CSS
// recomendados — a mesma conta que dimensiona o painel de setup da RA.
const BUTTON_SIZE = 84;
const LABEL_WIDTH = 150;
// Alto o bastante para o rotulo de 28 — o piso de legibilidade que
// `guiUnits.test.ts` guarda (~16px CSS em retrato de ~412px).
const CAPTION_HEIGHT = 38;

/**
 * `− 1,55 m +`: o controle da altura declarada do jogador.
 *
 * Existe como componente, e nao inline nos dois donos, porque ele aparece em
 * DOIS lugares que nao podem discordar — a tela inicial (escolher antes de
 * entrar) e a fase de setup da RA (corrigir depois de entrar). A correcao
 * pos-entrada e a razao de a RA-F3 existir: a origem e capturada no `onAttach`,
 * com o celular na pose de APERTAR UM BOTAO, e nao na de jogar; sem
 * recalibracao com a sessao no ar, o resto da sessao inteira herda esse offset.
 *
 * O componente nao persiste nem fala com o engine — ele so anuncia o valor
 * novo. Quem normaliza, guarda e declara ao 8th Wall e o `EighthWallARManager`,
 * para que exista um dono unico de `origin.y`.
 */
export class HeightStepper {
  /** Emite a altura em metros, ja na grade de 5 cm, a cada toque. */
  public readonly onChangedObservable = new Observable<number>();
  public readonly root: StackPanel;

  private readonly label: TextBlock;
  private value: number;

  public constructor(name: string, caption: string, initialHeightM: number) {
    this.value = normalizePlayerHeightM(initialHeightM);

    this.root = new StackPanel(`${name}-root`);
    this.root.isVertical = true;
    this.root.height = `${CAPTION_HEIGHT + BUTTON_SIZE}px`;
    this.root.spacing = 0;

    const captionText = new TextBlock(`${name}-caption`, caption);
    captionText.height = `${CAPTION_HEIGHT}px`;
    captionText.color = "#cbd5e1";
    captionText.fontSize = 28;
    captionText.fontFamily = "Trebuchet MS";
    captionText.isHitTestVisible = false;
    this.root.addControl(captionText);

    const row = new StackPanel(`${name}-row`);
    row.isVertical = false;
    row.height = `${BUTTON_SIZE}px`;
    row.spacing = 10;

    row.addControl(this.createStepButton(`${name}-minus`, "−", -1));

    this.label = new TextBlock(`${name}-value`, formatPlayerHeightM(this.value));
    this.label.width = `${LABEL_WIDTH}px`;
    this.label.height = `${BUTTON_SIZE}px`;
    this.label.color = "white";
    this.label.fontSize = 30;
    this.label.fontFamily = "Trebuchet MS";
    this.label.isHitTestVisible = false;
    row.addControl(this.label);

    row.addControl(this.createStepButton(`${name}-plus`, "+", 1));

    this.root.addControl(row);
  }

  public getValue(): number {
    return this.value;
  }

  /**
   * Reflete um valor decidido em outro lugar. NAO emite `onChanged`: os dois
   * steppers deste projeto convergem para o mesmo dono, e um setter que
   * notificasse fecharia o laco entre eles.
   */
  public setValue(heightM: number): void {
    this.value = normalizePlayerHeightM(heightM);
    this.label.text = formatPlayerHeightM(this.value);
  }

  public dispose(): void {
    this.root.dispose();
    this.onChangedObservable.clear();
  }

  private createStepButton(name: string, glyph: string, steps: number): Button {
    const button = Button.CreateSimpleButton(name, glyph);
    button.width = `${BUTTON_SIZE}px`;
    button.height = `${BUTTON_SIZE}px`;
    button.color = "white";
    button.fontSize = 34;
    button.fontFamily = "Trebuchet MS";
    button.cornerRadius = 12;
    button.thickness = 0;
    button.background = "#1f3a4d";
    button.textBlock?.setPadding(0, 0, 0, 0);
    button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    button.onPointerClickObservable.add(() => {
      const next = stepPlayerHeightM(this.value, steps);

      // Nas pontas da faixa o toque nao muda nada; avisar mesmo assim faria o
      // manager redeclarar a origem ao engine sem motivo, no meio do tracking.
      if (next === this.value) {
        return;
      }

      this.setValue(next);
      this.onChangedObservable.notifyObservers(this.value);
    });

    return button;
  }
}
