import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { convertMillisecondsToSimulationTicks } from "../battle/SimulationClock";
import type { TeamId, TowerLaneId } from "../battle/BattleTypes";
import { HealthBarMesh } from "../ui/HealthBarMesh";
import type { BaseUnit } from "../units/BaseUnit";

export interface TowerActorOptions {
  attackCooldownMs: number;
  attackDamage: number;
  attackRangeMultiplier: number;
  diameter: number;
  id: string;
  lane: TowerLaneId;
  maxHealth: number;
  mesh: Mesh;
  scene: Scene;
  team: TeamId;
}

export class TowerActor {
  public readonly attackCooldownMs: number;
  public readonly attackDamage: number;
  public readonly attackRangeMultiplier: number;
  public readonly diameter: number;
  public readonly id: string;
  public readonly lane: TowerLaneId;
  public readonly maxHealth: number;
  public readonly mesh: Mesh;
  public readonly team: TeamId;

  private readonly healthBar: HealthBarMesh;
  private readonly destroyedMaterial: StandardMaterial;
  private readonly attackCooldownTicks: number;

  private health: number;
  private lastAttackTick = Number.NEGATIVE_INFINITY;

  public constructor(options: TowerActorOptions) {
    this.attackCooldownMs = options.attackCooldownMs;
    this.attackDamage = options.attackDamage;
    this.attackRangeMultiplier = options.attackRangeMultiplier;
    this.diameter = options.diameter;
    this.id = options.id;
    this.lane = options.lane;
    this.maxHealth = options.maxHealth;
    this.mesh = options.mesh;
    this.team = options.team;
    this.health = options.maxHealth;
    this.attackCooldownTicks = convertMillisecondsToSimulationTicks(options.attackCooldownMs);

    this.healthBar = new HealthBarMesh({
      borderColorHex: this.team === "enemy" ? "#f87171" : "#7dd3fc",
      emissiveIntensity: 0.35,
      fillColorHex: this.team === "enemy" ? "#ef4444" : "#38bdf8",
      height: 0.34,
      id: this.id,
      parent: this.mesh,
      scene: options.scene,
      width: this.diameter * 1.35,
      yOffset: this.resolveHealthBarOffsetY(),
    });

    const destroyedMaterial = new StandardMaterial(`${this.id}-destroyed-material`, options.scene);
    destroyedMaterial.diffuseColor = Color3.FromHexString("#475569");
    destroyedMaterial.alpha = 0.7;
    this.destroyedMaterial = destroyedMaterial;

    this.updateHealthBar();
  }

  public isAlive(): boolean {
    return this.health > 0;
  }

  public getHealth(): number {
    return this.health;
  }

  public getAttackRange(): number {
    return this.diameter * this.attackRangeMultiplier;
  }

  public canAttack(unit: BaseUnit, currentTick: number): boolean {
    if (!this.isAlive() || !unit.isAlive() || unit.team === this.team) {
      return false;
    }

    const isCooldownReady = currentTick - this.lastAttackTick >= this.attackCooldownTicks;
    if (!isCooldownReady) {
      return false;
    }

    return this.getDistanceToUnit(unit) <= this.getAttackRange();
  }

  public tryAttack(unit: BaseUnit, currentTick: number): boolean {
    if (!this.canAttack(unit, currentTick)) {
      return false;
    }

    unit.takeDamage(this.attackDamage);
    this.lastAttackTick = currentTick;
    return true;
  }

  public receiveDamage(amount: number): void {
    if (!this.isAlive()) {
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.updateHealthBar();

    if (!this.isAlive()) {
      this.mesh.material = this.destroyedMaterial;
    }
  }

  public getDistanceToUnit(unit: BaseUnit): number {
    return this.mesh.position.subtract(unit.root.position).length();
  }

  public dispose(): void {
    this.healthBar.dispose();
    this.destroyedMaterial.dispose();
  }

  private updateHealthBar(): void {
    this.healthBar.setRemainingHealth(this.health, this.maxHealth);
    this.healthBar.setOpacity(this.isAlive() ? 1 : 0.7);
  }

  private resolveHealthBarOffsetY(): number {
    const localTop = this.mesh.getBoundingInfo().boundingBox.maximum.y;
    return localTop + 0.6;
  }
}
