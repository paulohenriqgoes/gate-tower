import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { TeamId } from "../battle/BattleTypes";
import type { TowerActor } from "../towers/TowerActor";
import { HealthBarMesh } from "../ui/HealthBarMesh";

export interface BaseUnitOptions {
  attackIntervalMs: number;
  attackIntervalRangeMs?: {
    max: number;
    min: number;
  };
  contactRange: number;
  displayName: string;
  health: number;
  id: string;
  movementSpeed: number;
  scene: Scene;
  spawnPosition: Vector3;
  team: TeamId;
}

export interface UnitVisualState {
  deltaSeconds: number;
  didAttack: boolean;
  distanceToTarget: number;
  isMoving: boolean;
  nowMs: number;
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

  protected readonly attackIntervalRangeMs: BaseUnitOptions["attackIntervalRangeMs"];
  protected health: number;
  protected nextAttackAt = Number.NEGATIVE_INFINITY;
  protected totalDistanceTravelled = 0;
  protected targetTower: TowerActor | null = null;
  protected readonly healthBar: HealthBarMesh;
  protected readonly visualRoot: TransformNode;

  public constructor(options: BaseUnitOptions) {
    this.attackIntervalMs = options.attackIntervalMs;
    this.attackIntervalRangeMs = options.attackIntervalRangeMs;
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
    this.visualRoot = new TransformNode(`${this.id}-visual-root`, this.scene);
    this.visualRoot.parent = this.root;

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
    this.healthBar = this.createHealthBar();
  }

  protected abstract createVisual(): void;

  protected abstract computeAttackDamage(): number;

  protected updateVisual(_state: UnitVisualState): void {}

  protected getHealthRatio(): number {
    if (this.maxHealth <= 0) {
      return 0;
    }

    return this.health / this.maxHealth;
  }

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
    this.healthBar.setRemainingHealth(this.health, this.maxHealth);

    if (!this.isAlive()) {
      this.root.setEnabled(false);
    }
  }

  public update(deltaSeconds: number, nowMs: number): void {
    if (!this.isAlive() || !this.targetTower || !this.targetTower.isAlive()) {
      this.updateVisual({
        deltaSeconds,
        didAttack: false,
        distanceToTarget: Number.POSITIVE_INFINITY,
        isMoving: false,
        nowMs,
      });
      return;
    }

    const direction = this.targetTower.mesh.position.subtract(this.root.position);
    direction.y = 0;

    const distanceToTarget = direction.length();
    let isMoving = false;

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
        isMoving = true;
      }

      this.nextAttackAt = Number.NEGATIVE_INFINITY;
      this.updateVisual({
        deltaSeconds,
        didAttack: false,
        distanceToTarget,
        isMoving,
        nowMs,
      });
      return;
    }

    const isAttackReady = nowMs >= this.nextAttackAt;
    if (!isAttackReady) {
      this.updateVisual({
        deltaSeconds,
        didAttack: false,
        distanceToTarget,
        isMoving: false,
        nowMs,
      });
      return;
    }

    this.targetTower.receiveDamage(this.computeAttackDamage());
    this.nextAttackAt = nowMs + this.resolveNextAttackIntervalMs();
    this.updateVisual({
      deltaSeconds,
      didAttack: true,
      distanceToTarget,
      isMoving: false,
      nowMs,
    });
  }

  public dispose(): void {
    this.root.dispose(false, true);
  }

  private createHealthBar(): HealthBarMesh {
    const { max, min } = this.root.getHierarchyBoundingVectors(true);
    const absoluteRootPosition = this.root.getAbsolutePosition();
    const unitHeight = max.y - absoluteRootPosition.y;
    const widestSpan = Math.max(max.x - min.x, max.z - min.z);

    return new HealthBarMesh({
      borderColorHex: "#f5d0fe",
      emissiveIntensity: 0.85,
      fillColorHex: "#ff00ff",
      height: 0.22,
      id: this.id,
      parent: this.root,
      scene: this.scene,
      width: Scalar.Clamp(widestSpan * 0.8, 1.35, 2.1),
      yOffset: unitHeight + 0.45,
    });
  }

  private resolveNextAttackIntervalMs(): number {
    if (!this.attackIntervalRangeMs) {
      return this.attackIntervalMs;
    }

    const min = Math.min(this.attackIntervalRangeMs.min, this.attackIntervalRangeMs.max);
    const max = Math.max(this.attackIntervalRangeMs.min, this.attackIntervalRangeMs.max);
    return min + Math.random() * (max - min);
  }
}
