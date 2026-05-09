import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { BaseUnit, type BaseUnitOptions } from "./BaseUnit";

export interface JavaliRaivosoOptions extends Omit<BaseUnitOptions, "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"> {}

export class JavaliRaivoso extends BaseUnit {
  public constructor(options: JavaliRaivosoOptions) {
    super({
      ...options,
      attackIntervalMs: 1100,
      contactRange: 1.5,
      displayName: "Javali Raivoso",
      health: 200,
      movementSpeed: 4.4,
    });
  }

  protected createVisual(): void {
    const bodyMaterial = new StandardMaterial(`${this.id}-body-material`, this.scene);
    bodyMaterial.diffuseColor = Color3.FromHexString("#7c4a2d");

    const maneMaterial = new StandardMaterial(`${this.id}-mane-material`, this.scene);
    maneMaterial.diffuseColor = Color3.FromHexString("#2f241d");

    const fangMaterial = new StandardMaterial(`${this.id}-fang-material`, this.scene);
    fangMaterial.diffuseColor = Color3.FromHexString("#f8fafc");

    const body = MeshBuilder.CreateBox(
      `${this.id}-body`,
      {
        width: 1.6,
        height: 0.9,
        depth: 1.9,
      },
      this.scene
    );
    body.parent = this.root;
    body.position.y = 0.82;
    body.material = bodyMaterial;

    const head = MeshBuilder.CreateBox(
      `${this.id}-head`,
      {
        width: 1.05,
        height: 0.72,
        depth: 0.88,
      },
      this.scene
    );
    head.parent = this.root;
    head.position = new Vector3(0, 0.9, 1.18);
    head.material = bodyMaterial;

    const mane = MeshBuilder.CreateBox(
      `${this.id}-mane`,
      {
        width: 0.36,
        height: 0.54,
        depth: 1.4,
      },
      this.scene
    );
    mane.parent = this.root;
    mane.position = new Vector3(0, 1.18, 0.12);
    mane.material = maneMaterial;

    const legOffsets: Array<[number, number]> = [
      [-0.48, -0.52],
      [0.48, -0.52],
      [-0.48, 0.52],
      [0.48, 0.52],
    ];

    for (const [x, z] of legOffsets) {
      const leg = MeshBuilder.CreateBox(
        `${this.id}-leg-${x}-${z}`,
        {
          width: 0.24,
          height: 0.72,
          depth: 0.24,
        },
        this.scene
      );
      leg.parent = this.root;
      leg.position = new Vector3(x, 0.34, z);
      leg.material = maneMaterial;
    }

    for (const x of [-0.25, 0.25]) {
      const fang = MeshBuilder.CreateBox(
        `${this.id}-fang-${x}`,
        {
          width: 0.12,
          height: 0.12,
          depth: 0.34,
        },
        this.scene
      );
      fang.parent = this.root;
      fang.position = new Vector3(x, 0.7, 1.62);
      fang.material = fangMaterial;
    }
  }

  protected computeAttackDamage(): number {
    return Math.max(1, Math.round(this.getTotalDistanceTravelled()));
  }
}
