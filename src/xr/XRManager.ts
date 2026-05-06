import { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/core/XR/webXRDefaultExperience";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes";
import "@babylonjs/core/XR/features/WebXRHitTest";
import { AdvancedDynamicTexture, Button, Control, TextBlock } from "@babylonjs/gui";
import type { IWebXRHitResult, WebXRHitTest } from "@babylonjs/core/XR/features/WebXRHitTest";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";

export class XRManager {
  private readonly scene: Scene;
  private readonly floorMeshes: Mesh[];
  private readonly arenaRoot: TransformNode;

  private xrHelper: WebXRDefaultExperience | null = null;
  private hitTestFeature: WebXRHitTest | null = null;
  private ui: AdvancedDynamicTexture | null = null;
  private toggleButton: Button | null = null;
  private statusText: TextBlock | null = null;
  private hitCursor: Mesh | null = null;

  private isARSupported = false;
  private isHitTestAvailable = false;
  private hasUserPlacedArenaInXR = false;
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
    this.createHitCursor();
    this.registerTouchPlacement();

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
        optionalFeatures: ["hit-test", "anchors"],
      });

      this.tryEnableHitTestFeature();

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

  private tryEnableHitTestFeature(): void {
    if (!this.xrHelper) {
      this.isHitTestAvailable = false;
      this.hitTestFeature = null;
      return;
    }

    try {
      this.hitTestFeature = this.xrHelper.baseExperience.featuresManager.enableFeature(
        WebXRFeatureName.HIT_TEST,
        "latest",
        {
          enableTransientHitTest: false,
          disablePermanentHitTest: false,
        },
        false,
        false
      );

      this.isHitTestAvailable = true;

      this.hitTestFeature.onHitTestResultObservable.add((results) => {
        if (!results.length) {
          return;
        }

        this.lastHitResult = results[0];
        this.updateHitCursorFromHit(this.lastHitResult);
      });
    } catch (error) {
      this.isHitTestAvailable = false;
      this.hitTestFeature = null;
      this.lastHitResult = null;
      console.warn("[XRManager] Hit-test indisponivel, continuando sem reposicionamento.", error);
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
    this.statusText.top = "92px";
    this.statusText.left = "-20px";
    this.statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.statusText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

    this.toggleButton.onPointerClickObservable.add(async () => {
      await this.toggleAR();
    });

    this.ui.addControl(this.toggleButton);
    this.ui.addControl(this.statusText);
  }

  private createHitCursor(): void {
    const cursor = MeshBuilder.CreateTorus(
      "hit-cursor",
      {
        diameter: 0.26,
        thickness: 0.02,
        tessellation: 24,
      },
      this.scene
    );

    const cursorMaterial = new StandardMaterial("hit-cursor-material", this.scene);
    cursorMaterial.diffuseColor = Color3.FromHexString("#16a34a");
    cursorMaterial.emissiveColor = Color3.FromHexString("#22c55e");
    cursor.material = cursorMaterial;
    cursor.isPickable = false;
    cursor.isVisible = false;

    this.hitCursor = cursor;
  }

  private registerTouchPlacement(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
        return;
      }

      if (!this.xrHelper || this.xrHelper.baseExperience.state !== WebXRState.IN_XR) {
        return;
      }

      if (!this.isHitTestAvailable) {
        this.updateUI("Hit-test indisponivel neste dispositivo", true);
        return;
      }

      if (!this.lastHitResult) {
        this.updateUI("Procure uma superficie e toque novamente", true);
        return;
      }

      this.applyPlacementFromHit(this.lastHitResult);
      this.arenaRoot.setEnabled(true);
      this.hasUserPlacedArenaInXR = true;
      this.updateUI();
    });
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
        this.arenaRoot.setEnabled(false);
        this.hasUserPlacedArenaInXR = false;
        this.lastHitResult = null;
        this.setHitCursorVisible(false);
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
      this.arenaRoot.setEnabled(false);
      this.hasUserPlacedArenaInXR = false;
      this.lastHitResult = null;
      this.setHitCursorVisible(false);
      return;
    }

    this.arenaRoot.setEnabled(true);
    this.hasUserPlacedArenaInXR = false;
    this.lastHitResult = null;
    this.setHitCursorVisible(false);
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

  private updateHitCursorFromHit(hitResult: IWebXRHitResult): void {
    if (!this.hitCursor || !this.xrHelper || this.xrHelper.baseExperience.state !== WebXRState.IN_XR) {
      return;
    }

    this.hitCursor.position.copyFrom(hitResult.position);

    if (!this.hitCursor.rotationQuaternion) {
      this.hitCursor.rotationQuaternion = Quaternion.Identity();
    }

    this.hitCursor.rotationQuaternion.copyFrom(hitResult.rotationQuaternion);
    this.setHitCursorVisible(true);
  }

  private setHitCursorVisible(value: boolean): void {
    if (!this.hitCursor) {
      return;
    }

    this.hitCursor.isVisible = value;
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
    if (!this.toggleButton || !this.statusText) {
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
      this.toggleButton.background = "#1f3a4d";
      return;
    }

    if (!this.isHitTestAvailable) {
      this.statusText.text = "RA: On | Hit-test indisponivel";
      this.toggleButton.background = "#216e39";
      return;
    }

    this.statusText.text = this.hasUserPlacedArenaInXR
      ? "RA: On | Arena posicionada"
      : "RA: On | Toque para posicionar a arena";
    this.toggleButton.background = isInXR ? "#216e39" : "#1f3a4d";
  }
}
