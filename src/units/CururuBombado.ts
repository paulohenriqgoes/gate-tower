import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

import { BaseUnit, type BaseUnitOptions, type UnitVisualState } from "./BaseUnit";

export interface CururuBombadoOptions extends Omit<
  BaseUnitOptions,
  "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"
> {
  towerMaxHealth: number;
}

export class CururuBombado extends BaseUnit {
  private readonly tongueBaseY = 1.86;
  private readonly tongueBaseZ = 1.86;
  private tongueMesh!: Mesh;

  private attackAnimationElapsed = Number.POSITIVE_INFINITY;
  private hopTime = 0;

  public constructor(options: CururuBombadoOptions) {
    super({
      ...options,
      attackIntervalMs: 1500,
      attackIntervalRangeMs: {
        max: 2000,
        min: 1000,
      },
      contactRange: 2.55,
      displayName: "Cururu Bombado",
      health: Math.round(options.towerMaxHealth * 0.6),
      movementSpeed: 2.1,
    });
  }

  protected createVisual(): void {
    const skinMaterial = new StandardMaterial(`${this.id}-skin-material`, this.scene);
    skinMaterial.diffuseColor = Color3.FromHexString("#4dc3d9");

    const shadowSkinMaterial = new StandardMaterial(`${this.id}-shadow-skin-material`, this.scene);
    shadowSkinMaterial.diffuseColor = Color3.FromHexString("#246b8f");

    const bellyMaterial = new StandardMaterial(`${this.id}-belly-material`, this.scene);
    bellyMaterial.diffuseColor = Color3.FromHexString("#9de7f2");

    const eyeMaterial = new StandardMaterial(`${this.id}-eye-material`, this.scene);
    eyeMaterial.diffuseColor = Color3.FromHexString("#dbeafe");

    const pupilMaterial = new StandardMaterial(`${this.id}-pupil-material`, this.scene);
    pupilMaterial.diffuseColor = Color3.FromHexString("#020617");

    const tongueMaterial = new StandardMaterial(`${this.id}-tongue-material`, this.scene);
    tongueMaterial.diffuseColor = Color3.FromHexString("#f472b6");
    tongueMaterial.emissiveColor = Color3.FromHexString("#ec4899").scale(0.25);

    const body = MeshBuilder.CreateBox(
      `${this.id}-body`,
      {
        width: 2.15,
        height: 1.35,
        depth: 2.35,
      },
      this.scene
    );
    body.parent = this.visualRoot;
    body.position = new Vector3(0, 1.1, 0.2);
    body.material = skinMaterial;

    const shoulders = MeshBuilder.CreateBox(
      `${this.id}-shoulders`,
      {
        width: 2.45,
        height: 0.62,
        depth: 1.15,
      },
      this.scene
    );
    shoulders.parent = this.visualRoot;
    shoulders.position = new Vector3(0, 1.7, 0);
    shoulders.material = shadowSkinMaterial;

    const belly = MeshBuilder.CreateBox(
      `${this.id}-belly`,
      {
        width: 1.28,
        height: 0.84,
        depth: 1.35,
      },
      this.scene
    );
    belly.parent = this.visualRoot;
    belly.position = new Vector3(0, 0.94, 0.74);
    belly.material = bellyMaterial;

    const head = MeshBuilder.CreateBox(
      `${this.id}-head`,
      {
        width: 1.9,
        height: 1.02,
        depth: 1.48,
      },
      this.scene
    );
    head.parent = this.visualRoot;
    head.position = new Vector3(0, 2.06, 1.06);
    head.material = skinMaterial;

    const jaw = MeshBuilder.CreateBox(
      `${this.id}-jaw`,
      {
        width: 1.72,
        height: 0.34,
        depth: 1.1,
      },
      this.scene
    );
    jaw.parent = this.visualRoot;
    jaw.position = new Vector3(0, 1.63, 1.36);
    jaw.material = shadowSkinMaterial;

    for (const x of [-0.52, 0.52]) {
      const eyeSocket = MeshBuilder.CreateBox(
        `${this.id}-eye-socket-${x}`,
        {
          width: 0.54,
          height: 0.54,
          depth: 0.54,
        },
        this.scene
      );
      eyeSocket.parent = this.visualRoot;
      eyeSocket.position = new Vector3(x, 2.64, 1.26);
      eyeSocket.material = eyeMaterial;

      const pupil = MeshBuilder.CreateBox(
        `${this.id}-pupil-${x}`,
        {
          width: 0.16,
          height: 0.16,
          depth: 0.16,
        },
        this.scene
      );
      pupil.parent = this.visualRoot;
      pupil.position = new Vector3(x, 2.55, 1.56);
      pupil.material = pupilMaterial;
    }

    const armDefinitions: Array<[number, number]> = [
      [-1.2, 0.36],
      [1.2, 0.36],
    ];

    for (const [x, z] of armDefinitions) {
      const upperArm = MeshBuilder.CreateBox(
        `${this.id}-upper-arm-${x}`,
        {
          width: 0.48,
          height: 0.88,
          depth: 0.58,
        },
        this.scene
      );
      upperArm.parent = this.visualRoot;
      upperArm.position = new Vector3(x, 1.12, z);
      upperArm.material = shadowSkinMaterial;

      const fist = MeshBuilder.CreateBox(
        `${this.id}-fist-${x}`,
        {
          width: 0.52,
          height: 0.34,
          depth: 0.52,
        },
        this.scene
      );
      fist.parent = this.visualRoot;
      fist.position = new Vector3(x, 0.48, z + 0.26);
      fist.material = skinMaterial;
    }

    const legDefinitions: Array<[number, number]> = [
      [-0.74, -0.52],
      [0.74, -0.52],
      [-0.78, 0.96],
      [0.78, 0.96],
    ];

    for (const [x, z] of legDefinitions) {
      const leg = MeshBuilder.CreateBox(
        `${this.id}-leg-${x}-${z}`,
        {
          width: 0.58,
          height: 0.66,
          depth: 0.64,
        },
        this.scene
      );
      leg.parent = this.visualRoot;
      leg.position = new Vector3(x, 0.38, z);
      leg.material = shadowSkinMaterial;
    }

    const backPlate = MeshBuilder.CreateBox(
      `${this.id}-back-plate`,
      {
        width: 1.5,
        height: 0.34,
        depth: 0.92,
      },
      this.scene
    );
    backPlate.parent = this.visualRoot;
    backPlate.position = new Vector3(0, 2.02, -0.52);
    backPlate.material = bellyMaterial;

    this.tongueMesh = MeshBuilder.CreateBox(
      `${this.id}-tongue`,
      {
        width: 0.24,
        height: 0.16,
        depth: 0.28,
      },
      this.scene
    );
    this.tongueMesh.parent = this.visualRoot;
    this.tongueMesh.position = new Vector3(0, this.tongueBaseY, this.tongueBaseZ);
    this.tongueMesh.material = tongueMaterial;
    this.tongueMesh.scaling.z = 0.25;
  }

  protected computeAttackDamage(): number {
    const missingHealthRatio = 1 - this.getHealthRatio();
    return 100 + Math.round(missingHealthRatio * 60);
  }

  protected updateVisual(state: UnitVisualState): void {
    this.hopTime += state.deltaSeconds;

    if (state.didAttack) {
      this.attackAnimationElapsed = 0;
    }

    const hopWave = state.isMoving ? Math.abs(Math.sin(this.hopTime * 4.2)) : 0;
    const baseBob = state.isMoving ? hopWave * 0.22 : Math.sin(this.hopTime * 1.4) * 0.03;
    const squashFactor = state.isMoving ? hopWave * 0.08 : 0;

    this.visualRoot.position.y = baseBob;
    this.visualRoot.scaling.x = 1 + squashFactor * 0.55;
    this.visualRoot.scaling.y = 1 - squashFactor * 0.65;
    this.visualRoot.scaling.z = 1 + squashFactor * 0.45;

    if (Number.isFinite(this.attackAnimationElapsed)) {
      this.attackAnimationElapsed += state.deltaSeconds;
      if (this.attackAnimationElapsed > 0.34) {
        this.attackAnimationElapsed = Number.POSITIVE_INFINITY;
      }
    }

    const attackProgress = Number.isFinite(this.attackAnimationElapsed)
      ? Math.min(1, this.attackAnimationElapsed / 0.34)
      : 1;
    const tonguePulse = Number.isFinite(this.attackAnimationElapsed)
      ? Math.sin(attackProgress * Math.PI)
      : 0;

    this.tongueMesh.scaling.z = 0.25 + tonguePulse * 6.2;
    this.tongueMesh.position.y = this.tongueBaseY + tonguePulse * 0.04;
    this.tongueMesh.position.z = this.tongueBaseZ + tonguePulse * 0.88;
  }
}
