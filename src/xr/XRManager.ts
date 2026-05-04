import { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/core/XR/webXRDefaultExperience";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes";
import { WebXRHitTest } from "@babylonjs/core/XR/features/WebXRHitTest";
import { AdvancedDynamicTexture, Button, Control, TextBlock } from "@babylonjs/gui";
import type { IWebXRHitResult } from "@babylonjs/core/XR/features/WebXRHitTest";

export class XRManager {
  private readonly scene: Scene;
  private readonly floorMeshes: Mesh[];
  private readonly arenaRoot: TransformNode;

  private xrHelper: WebXRDefaultExperience | null = null;
  private hitTestFeature: WebXRHitTest | null = null;
  private ui: AdvancedDynamicTexture | null = null;
  private toggleButton: Button | null = null;
  private lockButton: Button | null = null;
  private scaleUpButton: Button | null = null;
  private scaleDownButton: Button | null = null;
  private statusText: TextBlock | null = null;

  private isARSupported = false;
  private isPlacementLocked = false;
  private lastHitResult: IWebXRHitResult | null = null;
  private nonARScale = new Vector3(1, 1, 1);
  private arenaScaleInAR = 0.015;

  public constructor(scene: Scene, floorMeshes: Mesh[], arenaRoot: TransformNode) {
    this.scene = scene;
    this.floorMeshes = floorMeshes;
    this.arenaRoot = arenaRoot;
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

      this.hitTestFeature = this.xrHelper.baseExperience.featuresManager.enableFeature(
        WebXRFeatureName.HIT_TEST,
        "latest",
        {
          enableTransientHitTest: false,
          disablePermanentHitTest: false,
          useReferenceSpace: true,
        },
        true,
        false
      );

      this.hitTestFeature.onHitTestResultObservable.add((results) => {
        if (!results.length) {
          return;
        }

        this.lastHitResult = results[0];

        if (!this.isPlacementLocked) {
          this.applyPlacementFromHit(this.lastHitResult);
        }
      });

      this.xrHelper.baseExperience.onStateChangedObservable.add(() => {
        this.handleXRState();
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

    this.lockButton = Button.CreateSimpleButton("lock-arena", "Fixar Arena");
    this.lockButton.width = "220px";
    this.lockButton.height = "52px";
    this.lockButton.color = "white";
    this.lockButton.cornerRadius = 12;
    this.lockButton.background = "#0f766e";
    this.lockButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.lockButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.lockButton.top = "92px";
    this.lockButton.left = "-20px";

    this.scaleDownButton = Button.CreateSimpleButton("arena-scale-down", "Escala -");
    this.scaleDownButton.width = "104px";
    this.scaleDownButton.height = "46px";
    this.scaleDownButton.color = "white";
    this.scaleDownButton.cornerRadius = 12;
    this.scaleDownButton.background = "#374151";
    this.scaleDownButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.scaleDownButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scaleDownButton.top = "152px";
    this.scaleDownButton.left = "-136px";

    this.scaleUpButton = Button.CreateSimpleButton("arena-scale-up", "Escala +");
    this.scaleUpButton.width = "104px";
    this.scaleUpButton.height = "46px";
    this.scaleUpButton.color = "white";
    this.scaleUpButton.cornerRadius = 12;
    this.scaleUpButton.background = "#374151";
    this.scaleUpButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.scaleUpButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scaleUpButton.top = "152px";
    this.scaleUpButton.left = "-20px";

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

    this.lockButton.onPointerClickObservable.add(() => {
      this.togglePlacementLock();
    });

    this.scaleDownButton.onPointerClickObservable.add(() => {
      this.adjustArenaScale(-0.002);
    });

    this.scaleUpButton.onPointerClickObservable.add(() => {
      this.adjustArenaScale(0.002);
    });

    this.ui.addControl(this.toggleButton);
    this.ui.addControl(this.lockButton);
    this.ui.addControl(this.scaleDownButton);
    this.ui.addControl(this.scaleUpButton);
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
        this.nonARScale.copyFrom(this.arenaRoot.scaling);
        this.applyArenaScale(this.arenaScaleInAR);
        this.isPlacementLocked = false;
        await baseExperience.enterXRAsync("immersive-ar", "local-floor");
      }

      this.updateUI();
    } catch (error) {
      this.updateUI("Falha ao alternar RA", true);
      this.throwXRManagerError("Falha ao alternar sessao RA", error);
    }
  }

  private handleXRState(): void {
    if (!this.xrHelper) {
      return;
    }

    if (this.xrHelper.baseExperience.state === WebXRState.IN_XR) {
      this.isPlacementLocked = false;
      return;
    }

    this.isPlacementLocked = false;
    this.lastHitResult = null;
    this.arenaRoot.position.set(0, 0, 0);
    this.arenaRoot.rotationQuaternion = null;
    this.arenaRoot.scaling.copyFrom(this.nonARScale);
  }

  private applyPlacementFromHit(hitResult: IWebXRHitResult): void {
    this.arenaRoot.position.copyFrom(hitResult.position);

    if (!this.arenaRoot.rotationQuaternion) {
      this.arenaRoot.rotationQuaternion = Quaternion.Identity();
    }

    this.arenaRoot.rotationQuaternion.copyFrom(hitResult.rotationQuaternion);
  }

  private togglePlacementLock(): void {
    if (!this.xrHelper || this.xrHelper.baseExperience.state !== WebXRState.IN_XR) {
      this.updateUI("Entre em RA para posicionar", true);
      return;
    }

    if (!this.isPlacementLocked && this.lastHitResult) {
      this.applyPlacementFromHit(this.lastHitResult);
      this.isPlacementLocked = true;
      this.updateUI();
      return;
    }

    if (!this.isPlacementLocked && !this.lastHitResult) {
      this.updateUI("Procure uma superficie", true);
      return;
    }

    this.isPlacementLocked = false;
    this.updateUI();
  }

  private adjustArenaScale(delta: number): void {
    const nextScale = Math.min(0.08, Math.max(0.005, this.arenaScaleInAR + delta));
    this.arenaScaleInAR = Number(nextScale.toFixed(3));

    if (this.xrHelper?.baseExperience.state === WebXRState.IN_XR) {
      this.applyArenaScale(this.arenaScaleInAR);
      this.updateUI();
    }
  }

  private applyArenaScale(value: number): void {
    this.arenaRoot.scaling.setAll(value);
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
    if (!this.toggleButton || !this.statusText || !this.lockButton || !this.scaleDownButton || !this.scaleUpButton) {
      return;
    }

    if (customLabel) {
      this.statusText.text = customLabel;
      this.toggleButton.background = warning ? "#7c2d12" : "#1f3a4d";
      return;
    }

    const state = this.xrHelper?.baseExperience.state ?? 0;
    const isInXR = state === WebXRState.IN_XR;

    if (!isInXR) {
      this.statusText.text = "RA: Off";
      this.lockButton.textBlock!.text = "Fixar Arena";
      this.lockButton.background = "#0f766e";
      this.scaleDownButton.isEnabled = false;
      this.scaleUpButton.isEnabled = false;
      this.scaleDownButton.alpha = 0.5;
      this.scaleUpButton.alpha = 0.5;
      this.toggleButton.background = "#1f3a4d";
      return;
    }

    const scaleCmWidth = (24 * this.arenaScaleInAR * 100).toFixed(0);
    const scaleCmHeight = (36 * this.arenaScaleInAR * 100).toFixed(0);
    const placementStatus = this.isPlacementLocked ? "fixada" : "movendo";

    this.statusText.text = `RA: On | Arena ${placementStatus} | ${scaleCmWidth}x${scaleCmHeight}cm`;
    this.lockButton.textBlock!.text = this.isPlacementLocked ? "Destravar Arena" : "Fixar Arena";
    this.lockButton.background = this.isPlacementLocked ? "#7c2d12" : "#0f766e";
    this.scaleDownButton.isEnabled = true;
    this.scaleUpButton.isEnabled = true;
    this.scaleDownButton.alpha = 1;
    this.scaleUpButton.alpha = 1;
    this.toggleButton.background = isInXR ? "#216e39" : "#1f3a4d";
  }
}
