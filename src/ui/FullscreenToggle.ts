import { Button, Control } from "@babylonjs/gui";

import { TOP_ZONE_HEIGHT } from "./HudLayer";
import {
  isFullscreen,
  isFullscreenSupported,
  onOrientationChange,
  toggleFullscreen,
} from "./screenOrientation";

const BACKGROUND_OFF = "#1f3a4d";
const BACKGROUND_ON = "#216e39";
const PANEL_MARGIN = 12;

/**
 * Botao de tela cheia. Saiu do HUD de jogo (a spec da demo pede um HUD minimo
 * de batalha, sem esse botao) — so existe atras de `?debug=1`, como
 * ferramenta de teste (ver `main.ts`). A entrada em fullscreen ja e tentada
 * sozinha no primeiro gesto, mas quem sai (gesto do sistema, botao voltar)
 * precisa de um caminho de volta — e insistir a cada toque seria hostil.
 *
 * Ancorado no canto superior esquerdo, abaixo de `TOP_ZONE_HEIGHT` (a faixa
 * de HP/timer do HUD de batalha) para nunca invadir as zonas `top`/`thumb`.
 *
 * Fica oculto onde a API nao existe (Safari do iPhone), onde tela cheia so sai
 * adicionando o site a tela de inicio.
 */
export class FullscreenToggle {
  public readonly root: Button;

  private readonly disposeOrientationListener: () => void;

  public constructor() {
    this.root = Button.CreateSimpleButton("fullscreen-btn", "⛶");
    this.root.width = "72px";
    this.root.height = "72px";
    this.root.color = "white";
    this.root.cornerRadius = 12;
    this.root.background = BACKGROUND_OFF;
    this.root.fontSize = 32;
    this.root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.root.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.root.left = `${PANEL_MARGIN}px`;
    this.root.top = `${TOP_ZONE_HEIGHT + PANEL_MARGIN}px`;

    this.root.onPointerClickObservable.add(() => {
      void toggleFullscreen();
    });

    this.disposeOrientationListener = onOrientationChange(() => {
      this.refresh();
    });

    this.refresh();
  }

  /** Falso onde o navegador nao tem Fullscreen API (Safari do iPhone). */
  public isAvailable(): boolean {
    return isFullscreenSupported();
  }

  public dispose(): void {
    this.disposeOrientationListener();
  }

  private refresh(): void {
    this.root.background = isFullscreen() ? BACKGROUND_ON : BACKGROUND_OFF;
  }
}
