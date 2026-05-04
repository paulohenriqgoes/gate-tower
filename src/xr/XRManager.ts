import { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/core/XR/webXRDefaultExperience";
import { AdvancedDynamicTexture, Button, Control, TextBlock } from "@babylonjs/gui";

export class XRManager {
  private readonly scene: Scene;
  private readonly floorMeshes: Mesh[];

  private xrHelper: WebXRDefaultExperience | null = null;
  private ui: AdvancedDynamicTexture | null = null;
  private toggleButton: Button | null = null;
  private statusText: TextBlock | null = null;

  private isARSupported = false;

  public constructor(scene: Scene, floorMeshes: Mesh[]) {
    this.scene = scene;
    this.floorMeshes = floorMeshes;
  }

  public async initialize(): Promise<void> {
    this.createBabylonToggleUI();

    try {
      this.isARSupported = await WebXRSessionManager.IsSessionSupportedAsync("immersive-ar");
    } catch (error) {
      this.isARSupported = false;
      this.updateUI("RA indisponivel", true);
      this.throwXRManagerError("Falha ao verificar suporte de RA", error);
      return;
    }

    if (!this.isARSupported) {
      this.updateUI("RA indisponivel", true);
      return;
    }

    try {
      this.xrHelper = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes: this.floorMeshes,
        uiOptions: {
          sessionMode: "immersive-ar",
          referenceSpaceType: "local-floor",
        },
        optionalFeatures: true,
      });

      this.xrHelper.baseExperience.onStateChangedObservable.add(() => {
        this.updateUI();
      });

      this.updateUI();
    } catch (error) {
      this.xrHelper = null;
      this.isARSupported = false;
      this.updateUI("Falha ao iniciar RA", true);
      this.throwXRManagerError("Falha ao iniciar createDefaultXRExperienceAsync", error);
    }
  }

  private createBabylonToggleUI(): void {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI("xr-ui", true, this.scene);

    this.toggleButton = Button.CreateSimpleButton("toggle-ra", "Alternar RA");
    this.toggleButton.width = "220px";
    this.toggleButton.height = "60px";
    this.toggleButton.color = "white";
    this.toggleButton.cornerRadius = 12;
    this.toggleButton.background = "#1f3a4d";
    this.toggleButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.toggleButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.toggleButton.top = "20px";
    this.toggleButton.left = "-20px";

    this.statusText = new TextBlock("ra-status", "RA: Off");
    this.statusText.color = "white";
    this.statusText.fontSize = 20;
    this.statusText.height = "40px";
    this.statusText.top = "88px";
    this.statusText.left = "-20px";
    this.statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    this.toggleButton.onPointerClickObservable.add(async () => {
      await this.toggleAR();
    });

    this.ui.addControl(this.toggleButton);
    this.ui.addControl(this.statusText);
  }

  private async toggleAR(): Promise<void> {
    if (!this.xrHelper || !this.isARSupported) {
      this.updateUI("RA indisponivel", true);
      return;
    }

    const baseExperience = this.xrHelper.baseExperience;

    try {
      if (baseExperience.state === 2) {
        await baseExperience.exitXRAsync();
      } else {
        await baseExperience.enterXRAsync("immersive-ar", "local-floor");
      }

      this.updateUI();
    } catch (error) {
      this.updateUI("Falha ao alternar RA", true);
      this.throwXRManagerError("Falha ao alternar sessao RA", error);
    }
  }

  private throwXRManagerError(context: string, error: unknown): never {
    const baseError = error instanceof Error ? error : new Error(String(error));
    const fullMessage = `${context}: ${baseError.message}`;
    const wrappedError = new Error(fullMessage);

    if (baseError.stack) {
      wrappedError.stack = `${wrappedError.name}: ${fullMessage}\n${baseError.stack}`;
    }

    console.error("[XRManager]", wrappedError);
    throw wrappedError;
  }

  private updateUI(customLabel?: string, warning = false): void {
    if (!this.toggleButton || !this.statusText) {
      return;
    }

    if (customLabel) {
      this.statusText.text = customLabel;
      this.toggleButton.background = warning ? "#7c2d12" : "#1f3a4d";
      return;
    }

    const state = this.xrHelper?.baseExperience.state ?? 0;
    const isInXR = state === 2;

    this.statusText.text = isInXR ? "RA: On" : "RA: Off";
    this.toggleButton.background = isInXR ? "#216e39" : "#1f3a4d";
  }
}
