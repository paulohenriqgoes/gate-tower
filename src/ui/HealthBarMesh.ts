import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export interface HealthBarMeshOptions {
  backgroundColorHex?: string;
  borderColorHex?: string;
  emissiveIntensity?: number;
  fillColorHex: string;
  height: number;
  id: string;
  parent: Mesh | TransformNode;
  scene: Scene;
  width: number;
  yOffset: number;
  zOffset?: number;
}

export class HealthBarMesh {
  private readonly backgroundMesh;
  private readonly borderMesh;
  private readonly fillMesh;
  private readonly fillWidth: number;
  private readonly root: TransformNode;

  public constructor(options: HealthBarMeshOptions) {
    const borderPadding = Math.max(options.height * 0.12, 0.03);
    const backgroundWidth = Math.max(options.width - borderPadding, options.height);
    const backgroundHeight = Math.max(options.height - borderPadding, options.height * 0.7);
    const fillInsetX = Math.max(options.height * 0.24, 0.04);
    const fillHeight = Math.max(backgroundHeight * 0.5, 0.05);

    this.fillWidth = Math.max(backgroundWidth - fillInsetX * 2, 0.08);

    this.root = new TransformNode(`${options.id}-healthbar-root`, options.scene);
    this.root.parent = options.parent;
    this.root.position = new Vector3(0, options.yOffset, options.zOffset ?? 0);
    this.root.billboardMode = TransformNode.BILLBOARDMODE_ALL;

    this.borderMesh = MeshBuilder.CreatePlane(
      `${options.id}-healthbar-border`,
      {
        height: options.height,
        width: options.width,
      },
      options.scene
    );
    this.borderMesh.parent = this.root;
    this.borderMesh.isPickable = false;
    this.borderMesh.material = this.createMaterial(
      `${options.id}-healthbar-border-material`,
      options.scene,
      options.borderColorHex ?? options.fillColorHex,
      0.95,
      options.emissiveIntensity ?? 0.4
    );

    this.backgroundMesh = MeshBuilder.CreatePlane(
      `${options.id}-healthbar-background`,
      {
        height: backgroundHeight,
        width: backgroundWidth,
      },
      options.scene
    );
    this.backgroundMesh.parent = this.root;
    this.backgroundMesh.position.z = -0.005;
    this.backgroundMesh.isPickable = false;
    this.backgroundMesh.material = this.createMaterial(
      `${options.id}-healthbar-background-material`,
      options.scene,
      options.backgroundColorHex ?? "#020617",
      0.9,
      0
    );

    this.fillMesh = MeshBuilder.CreatePlane(
      `${options.id}-healthbar-fill`,
      {
        height: fillHeight,
        width: this.fillWidth,
      },
      options.scene
    );
    this.fillMesh.parent = this.root;
    this.fillMesh.position.z = -0.01;
    this.fillMesh.position.y = -backgroundHeight * 0.02;
    this.fillMesh.isPickable = false;
    this.fillMesh.material = this.createMaterial(
      `${options.id}-healthbar-fill-material`,
      options.scene,
      options.fillColorHex,
      1,
      options.emissiveIntensity ?? 0.4
    );

    this.setRemainingHealth(1, 1);
    this.setOpacity(1);
  }

  public dispose(): void {
    this.root.dispose(false, true);
  }

  public setOpacity(value: number): void {
    const opacity = Scalar.Clamp(value, 0, 1);
    this.borderMesh.visibility = opacity;
    this.backgroundMesh.visibility = opacity;
    this.fillMesh.visibility = opacity;
  }

  public setRemainingHealth(currentHealth: number, maxHealth: number): void {
    const ratio = maxHealth <= 0 ? 0 : Scalar.Clamp(currentHealth / maxHealth, 0, 1);
    this.fillMesh.isVisible = ratio > 0;

    if (!this.fillMesh.isVisible) {
      return;
    }

    this.fillMesh.scaling.x = ratio;
    // Mantem a borda esquerda fixa enquanto a barra reduz para a direita.
    this.fillMesh.position.x = (this.fillWidth * (ratio - 1)) / 2;
  }

  private createMaterial(
    name: string,
    scene: Scene,
    colorHex: string,
    alpha: number,
    emissiveIntensity: number
  ): StandardMaterial {
    const material = new StandardMaterial(name, scene);
    const color = Color3.FromHexString(colorHex);

    material.diffuseColor = color;
    material.emissiveColor = color.scale(emissiveIntensity);
    material.alpha = alpha;
    material.disableLighting = true;
    material.backFaceCulling = false;

    return material;
  }
}
