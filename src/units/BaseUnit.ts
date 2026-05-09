import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { TeamId } from "../battle/BattleTypes";
import type { TowerActor } from "../towers/TowerActor";

export interface BaseUnitOptions {
  attackIntervalMs: number;
  contactRange: number;
  displayName: string;
  health: number;
  id: string;
  movementSpeed: number;
  scene: Scene;
  spawnPosition: Vector3;
  team: TeamId;
}

export abstract class BaseUnit {
  public readonly attackIntervalMs: number;
  public readonly contactRange: number;
  public readonly displayName: string;
  public readonly id: string;
  public readonly maxHealth: number;
  public readonly movementSpeed: number;
  public readonly root: TransformNode;
  public readonly scene: Scene;
  public readonly team: TeamId;

  protected health: number;
  protected lastAttackAt = Number.NEGATIVE_INFINITY;
  protected totalDistanceTravelled = 0;
  protected targetTower: TowerActor | null = null;

  public constructor(options: BaseUnitOptions) {
    this.attackIntervalMs = options.attackIntervalMs;
    this.contactRange = options.contactRange;
    this.displayName = options.displayName;
    this.id = options.id;
    this.maxHealth = options.health;
    this.movementSpeed = options.movementSpeed;
    this.scene = options.scene;
    this.team = options.team;
    this.health = options.health;

    this.root = new TransformNode(`${this.id}-root`, this.scene);
    this.root.position.copyFrom(options.spawnPosition);

    const selectionRing = MeshBuilder.CreateTorus(
      `${this.id}-selection-ring`,
      {
        diameter: 1.8,
        thickness: 0.06,
      },
      this.scene
    );
    const ringMaterial = new StandardMaterial(`${this.id}-selection-material`, this.scene);
    ringMaterial.diffuseColor = this.team === "player"
      ? Color3.FromHexString("#c084fc")
      : Color3.FromHexString("#fb7185");
    ringMaterial.emissiveColor = ringMaterial.diffuseColor;

    selectionRing.material = ringMaterial;
    selectionRing.parent = this.root;
    selectionRing.position.y = 0.08;
    selectionRing.rotation.x = Math.PI / 2;
    selectionRing.isPickable = false;

    this.createVisual();
  }

  protected abstract createVisual(): void;

  protected abstract computeAttackDamage(): number;

  public isAlive(): boolean {
    return this.health > 0;
  }

  public getHealth(): number {
    return this.health;
  }

  public getTotalDistanceTravelled(): number {
    return this.totalDistanceTravelled;
  }

  public setTargetTower(tower: TowerActor | null): void {
    this.targetTower = tower;
  }

  public getTargetTower(): TowerActor | null {
    return this.targetTower;
  }

  public takeDamage(amount: number): void {
    if (!this.isAlive()) {
      return;
    }

    this.health = Math.max(0, this.health - amount);

    if (!this.isAlive()) {
      this.root.setEnabled(false);
    }
  }

  public update(deltaSeconds: number, nowMs: number): void {
    if (!this.isAlive() || !this.targetTower || !this.targetTower.isAlive()) {
      return;
    }

    const direction = this.targetTower.mesh.position.subtract(this.root.position);
    direction.y = 0;

    const distanceToTarget = direction.length();

    if (distanceToTarget > this.contactRange) {
      const movementDistance = Math.min(
        this.movementSpeed * deltaSeconds,
        Math.max(0, distanceToTarget - this.contactRange)
      );

      if (movementDistance > 0) {
        const movementDirection = direction.normalize();
        const movement = movementDirection.scale(movementDistance);
        this.root.position.addInPlace(movement);
        this.totalDistanceTravelled += movementDistance;
        this.root.rotation.y = Math.atan2(movementDirection.x, movementDirection.z);
      }

      return;
    }

    const isAttackReady = nowMs - this.lastAttackAt >= this.attackIntervalMs;
    if (!isAttackReady) {
      return;
    }

    this.targetTower.receiveDamage(this.computeAttackDamage());
    this.lastAttackAt = nowMs;
  }

  public dispose(): void {
    this.root.dispose(false, true);
  }
}
