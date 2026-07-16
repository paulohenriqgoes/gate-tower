import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import "@babylonjs/core/Culling/ray";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { AdvancedDynamicTexture, Button, Control, Rectangle, Slider, StackPanel, TextBlock } from "@babylonjs/gui";

import { installBabylonGlobalsForXR8 } from "./babylonRuntimeGlobals";

const XR8_LOAD_TIMEOUT_MS = 15000;
const MAX_PLACEMENT_DISTANCE = 40;

/**
 * Gerencia o modo RA via engine 8th Wall (SLAM), substituindo a sessao WebXR.
 * O chao estimado pelo SLAM fica no plano y = 0 do mundo; posicionamento da
 * arena e cursor usam raycast contra esse plano.
 */
export class EighthWallARManager {
  private readonly scene: Scene;
  private readonly arenaRoot: TransformNode;
  private readonly groundPlane = new Plane(0, 1, 0, 0);

  private ui: AdvancedDynamicTexture | null = null;
  private toggleButton: Button | null = null;
  private statusText: TextBlock | null = null;
  private hitCursor: Mesh | null = null;
  private scalePanel: Rectangle | null = null;
  private scaleSlider: Slider | null = null;
  private scaleValueText: TextBlock | null = null;
  private scaleButton: Button | null = null;
  private isScaleToolActive = false;

  private arCamera: FreeCamera | null = null;
  private previousCamera: Camera | null = null;
  private cameraBehavior: Behavior<Camera> | null = null;

  private isXR8Ready = false;
  private hasXR8LoadFailed = false;
  private isARSupported = false;
  private isInAR = false;
  private isEnteringAR = false;
  private hasUserPlacedArenaInXR = false;
  private nonARScale = new Vector3(1, 1, 1);
  private arenaScaleInAR = 0.005;

  public constructor(scene: Scene, arenaRoot: TransformNode) {
    this.scene = scene;
    this.arenaRoot = arenaRoot;
  }

  public initialize(): void {
    this.createBabylonToggleUI();
    this.createHitCursor();
    this.registerCursorTracking();
    this.registerTouchPlacement();
    this.waitForXR8Load();
  }

  private waitForXR8Load(): void {
    if (window.XR8) {
      this.markXR8Ready();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      this.hasXR8LoadFailed = true;
      this.updateUI();
    }, XR8_LOAD_TIMEOUT_MS);

    window.addEventListener(
      "xrloaded",
      () => {
        window.clearTimeout(timeoutId);
        this.markXR8Ready();
      },
      { once: true }
    );

    this.updateUI();
  }

  private markXR8Ready(): void {
    this.isXR8Ready = true;

    try {
      this.isARSupported = window.XR8?.XrDevice.isDeviceBrowserCompatible() ?? false;
    } catch (error) {
      this.isARSupported = false;
      console.warn("[EighthWallARManager] Falha ao verificar compatibilidade do dispositivo.", error);
    }

    this.updateUI();
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

    this.toggleButton.onPointerClickObservable.add(() => {
      void this.toggleAR();
    });

    this.scaleButton = Button.CreateSimpleButton("scale-btn", "⤡");
    this.scaleButton.width = "60px";
    this.scaleButton.height = "60px";
    this.scaleButton.color = "white";
    this.scaleButton.cornerRadius = 12;
    this.scaleButton.background = "#1f3a4d";
    this.scaleButton.fontSize = 28;
    this.scaleButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.scaleButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.scaleButton.top = "20px";
    this.scaleButton.left = "-250px";
    this.scaleButton.isVisible = false;

    this.scaleButton.onPointerClickObservable.add(() => {
      this.isScaleToolActive = true;
      this.setScalePanelVisible(true);
      this.updateUI();
    });

    this.ui.addControl(this.toggleButton);
    this.ui.addControl(this.scaleButton);
    this.ui.addControl(this.statusText);
    this.createScaleSliderUI();
  }

  private createScaleSliderUI(): void {
    if (!this.ui) {
      return;
    }

    const panel = new Rectangle("arena-scale-panel");
    panel.width = "260px";
    panel.height = "160px";
    panel.cornerRadius = 12;
    panel.color = "#4b5563";
    panel.thickness = 1;
    panel.background = "#111827d9";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.left = "-20px";
    panel.top = "20px";
    panel.isVisible = false;

    const stack = new StackPanel("arena-scale-stack");
    stack.isVertical = true;
    stack.paddingTop = "10px";
    stack.paddingLeft = "12px";
    stack.paddingRight = "12px";
    stack.paddingBottom = "10px";

    const title = new TextBlock("arena-scale-title", "Escala da arena");
    title.height = "26px";
    title.color = "white";
    title.fontSize = 18;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    const slider = new Slider("arena-scale-slider");
    slider.minimum = 0.005;
    slider.maximum = 0.100;
    slider.value = this.arenaScaleInAR;
    slider.height = "20px";
    slider.width = "100%";
    slider.background = "#374151";
    slider.color = "#22c55e";

    const valueText = new TextBlock("arena-scale-value", `Escala: ${this.arenaScaleInAR.toFixed(3)}`);
    valueText.height = "22px";
    valueText.color = "#d1d5db";
    valueText.fontSize = 15;
    valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    slider.onValueChangedObservable.add((value) => {
      this.arenaScaleInAR = Number(value.toFixed(3));
      valueText.text = `Escala: ${this.arenaScaleInAR.toFixed(3)}`;

      if (this.isInAR && this.hasUserPlacedArenaInXR) {
        this.applyArenaScale(this.arenaScaleInAR);
      }
    });

    const okButton = Button.CreateSimpleButton("scale-ok-btn", "✓ OK");
    okButton.width = "80px";
    okButton.height = "32px";
    okButton.color = "white";
    okButton.cornerRadius = 8;
    okButton.background = "#22c55e";
    okButton.fontSize = 16;

    okButton.onPointerClickObservable.add(() => {
      this.isScaleToolActive = false;
      this.setScalePanelVisible(false);
      this.updateUI();
    });

    stack.addControl(title);
    stack.addControl(slider);
    stack.addControl(valueText);
    stack.addControl(okButton);
    panel.addControl(stack);
    this.ui.addControl(panel);

    this.scalePanel = panel;
    this.scaleSlider = slider;
    this.scaleValueText = valueText;
  }

  private createHitCursor(): void {
    const cursor = MeshBuilder.CreateTorus(
      "hit-cursor",
      {
        diameter: 0.35,
        thickness: 0.02
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

  private registerCursorTracking(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      if (!this.isInAR || this.hasUserPlacedArenaInXR || !this.hitCursor) {
        return;
      }

      const engine = this.scene.getEngine();
      const groundPoint = this.pickGroundPoint(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);

      if (!groundPoint) {
        this.setHitCursorVisible(false);
        return;
      }

      this.hitCursor.position.copyFrom(groundPoint);
      this.hitCursor.rotationQuaternion = null;
      this.hitCursor.rotation.set(0, 0, 0);
      this.setHitCursorVisible(true);
    });
  }

  private registerTouchPlacement(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
        return;
      }

      if (!this.isInAR || this.hasUserPlacedArenaInXR) {
        return;
      }

      const groundPoint = this.pickGroundPoint(this.scene.pointerX, this.scene.pointerY);

      if (!groundPoint) {
        this.updateUI("Procure uma superficie e toque novamente", true);
        return;
      }

      this.applyPlacement(groundPoint);
      this.arenaRoot.setEnabled(true);
      this.hasUserPlacedArenaInXR = true;
      this.setHitCursorVisible(false);
      this.setScalePanelVisible(false);
      this.updateUI();
    });
  }

  private pickGroundPoint(screenX: number, screenY: number): Vector3 | null {
    if (!this.arCamera) {
      return null;
    }

    const ray = this.scene.createPickingRay(screenX, screenY, Matrix.Identity(), this.arCamera);
    const distance = ray.intersectsPlane(this.groundPlane);

    if (distance === null || distance < 0 || distance > MAX_PLACEMENT_DISTANCE) {
      return null;
    }

    return ray.origin.add(ray.direction.scale(distance));
  }

  private async toggleAR(): Promise<void> {
    if (this.isEnteringAR) {
      return;
    }

    if (!this.isXR8Ready || !this.isARSupported || !window.XR8) {
      this.updateUI("RA indisponivel", true);
      return;
    }

    if (this.isInAR) {
      this.exitAR();
      return;
    }

    await this.enterAR(window.XR8);
  }

  private async enterAR(xr8: XR8Api): Promise<void> {
    this.isEnteringAR = true;
    this.updateUI("Iniciando RA...", false);

    try {
      await this.requestMotionPermission();

      installBabylonGlobalsForXR8();
      xr8.XrController.configure({ scale: "absolute" });
      xr8.addCameraPipelineModule(this.createStatusPipelineModule());

      this.nonARScale.copyFrom(this.arenaRoot.scaling);
      this.applyArenaScale(this.arenaScaleInAR);
      this.arenaRoot.setEnabled(false);
      this.hasUserPlacedArenaInXR = false;
      this.isScaleToolActive = false;
      this.setHitCursorVisible(false);
      this.setScalePanelVisible(false);

      this.previousCamera = this.scene.activeCamera;
      this.previousCamera?.detachControl();

      this.arCamera = new FreeCamera("ar-camera", new Vector3(0, 2, 0), this.scene);
      this.arCamera.minZ = 0.01;
      this.arCamera.maxZ = 1000;
      this.scene.activeCamera = this.arCamera;

      this.cameraBehavior = xr8.Babylonjs.xrCameraBehavior({
        cameraConfig: { direction: xr8.XrConfig.camera().BACK },
      });
      this.arCamera.addBehavior(this.cameraBehavior, true);

      this.isInAR = true;
      this.updateUI();
    } catch (error) {
      console.error("[EighthWallARManager] Falha ao iniciar RA.", error);
      this.exitAR();
      this.updateUI("Falha ao iniciar RA", true);
    } finally {
      this.isEnteringAR = false;
    }
  }

  private exitAR(): void {
    if (this.arCamera && this.cameraBehavior) {
      this.arCamera.removeBehavior(this.cameraBehavior);
    }

    this.cameraBehavior = null;

    if (this.arCamera) {
      this.arCamera.dispose();
      this.arCamera = null;
    }

    // O attach do behavior desliga o autoClear para desenhar o feed da camera.
    this.scene.autoClear = true;

    if (this.previousCamera) {
      this.scene.activeCamera = this.previousCamera;
      this.previousCamera.attachControl(true);
      this.previousCamera = null;
    }

    this.isInAR = false;
    this.hasUserPlacedArenaInXR = false;
    this.isScaleToolActive = false;
    this.setHitCursorVisible(false);
    this.setScalePanelVisible(false);

    this.arenaRoot.setEnabled(true);
    this.arenaRoot.position.set(0, 0, 0);
    this.arenaRoot.rotationQuaternion = null;
    this.arenaRoot.rotation.set(0, 0, 0);
    this.arenaRoot.scaling.copyFrom(this.nonARScale);

    this.updateUI();
  }

  private createStatusPipelineModule(): XR8CameraPipelineModule {
    return {
      name: "gate-ar-status",
      onCameraStatusChange: ({ status }) => {
        if (status !== "failed") {
          return;
        }

        // Sai fora do callback do pipeline para nao parar o XR8 durante o proprio tick.
        window.setTimeout(() => {
          this.exitAR();
          this.updateUI("Permissao de camera negada", true);
        }, 0);
      },
      onException: (error) => {
        console.error("[EighthWallARManager] Erro no engine 8th Wall.", error);

        window.setTimeout(() => {
          this.exitAR();
          this.updateUI("Falha ao iniciar RA", true);
        }, 0);
      },
    };
  }

  /** iOS 13+ exige permissao explicita de sensores de movimento dentro de um gesto do usuario. */
  private async requestMotionPermission(): Promise<void> {
    const motionEvent =
      typeof DeviceMotionEvent !== "undefined"
        ? (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        : null;

    if (!motionEvent?.requestPermission) {
      return;
    }

    try {
      const result = await motionEvent.requestPermission();

      if (result !== "granted") {
        throw new Error("Permissao de sensores de movimento negada.");
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private applyPlacement(groundPoint: Vector3): void {
    this.arenaRoot.position.copyFrom(groundPoint);

    // Alinha o eixo +Z da arena com a direcao horizontal da camera: torres
    // azuis (lado do jogador) ficam mais proximas de quem posicionou.
    const forward = this.arCamera
      ? this.arCamera.getDirection(Vector3.Forward())
      : Vector3.Forward();
    const yaw = Math.atan2(forward.x, forward.z);
    this.arenaRoot.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);

    this.applyArenaScale(this.arenaScaleInAR);
  }

  private setHitCursorVisible(value: boolean): void {
    if (!this.hitCursor) {
      return;
    }

    this.hitCursor.isVisible = value;
  }

  private setScalePanelVisible(value: boolean): void {
    if (!this.scalePanel) {
      return;
    }

    this.scalePanel.isVisible = value;

    if (this.scaleSlider && this.scaleValueText) {
      this.scaleSlider.value = this.arenaScaleInAR;
      this.scaleValueText.text = `Escala: ${this.arenaScaleInAR.toFixed(3)}`;
    }
  }

  private applyArenaScale(value: number): void {
    this.arenaRoot.scaling.setAll(value);
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

    if (!this.isXR8Ready) {
      this.toggleButton.isVisible = true;
      this.statusText.text = this.hasXR8LoadFailed ? "RA indisponivel" : "Carregando RA...";
      this.toggleButton.background = "#1f3a4d";
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.isARSupported) {
      this.toggleButton.isVisible = true;
      this.statusText.text = "RA indisponivel";
      this.toggleButton.background = "#1f3a4d";
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.isInAR) {
      // Fora do AR: apenas toggle visivel
      this.toggleButton.isVisible = true;
      this.statusText.text = "RA: Off";
      this.toggleButton.background = "#1f3a4d";
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(false);
      return;
    }

    if (!this.hasUserPlacedArenaInXR) {
      // AR + arena nao posicionada: exibir scale panel no lugar do toggle
      this.toggleButton.isVisible = false;
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(true);
      this.statusText.text = "RA: On | Toque para posicionar a arena";
      return;
    }

    if (this.isScaleToolActive) {
      // AR + arena posicionada + escala ativa: scale panel no lugar do toggle
      this.toggleButton.isVisible = false;
      if (this.scaleButton) this.scaleButton.isVisible = false;
      this.setScalePanelVisible(true);
      this.statusText.text = "RA: On | Ajuste a escala da arena";
      return;
    }

    // AR + arena posicionada: toggle + botao escala
    this.toggleButton.isVisible = true;
    this.toggleButton.background = "#216e39";
    if (this.scaleButton) this.scaleButton.isVisible = true;
    this.setScalePanelVisible(false);
    this.statusText.text = "RA: On | Arena posicionada";
  }
}
