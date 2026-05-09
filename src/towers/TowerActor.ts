import { Control, Rectangle, TextBlock, AdvancedDynamicTexture } from "@babylonjs/gui";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId, TowerLaneId } from "../battle/BattleTypes";
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
  ui: AdvancedDynamicTexture;
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

  private readonly healthFill: Rectangle;
  private readonly healthLabel: TextBlock;
  private readonly healthRoot: Rectangle;
  private readonly destroyedMaterial: StandardMaterial;

  private health: number;
  private lastAttackAt = Number.NEGATIVE_INFINITY;

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

    const healthRoot = new Rectangle(`${this.id}-health-root`);
    healthRoot.width = "110px";
    healthRoot.height = "22px";
    healthRoot.cornerRadius = 10;
    healthRoot.thickness = 1;
    healthRoot.color = "#0f172a";
    healthRoot.background = "#111827e6";
    healthRoot.isPointerBlocker = false;
    healthRoot.linkWithMesh(this.mesh);
    healthRoot.linkOffsetY = -84;

    const healthFill = new Rectangle(`${this.id}-health-fill`);
    healthFill.width = "100%";
    healthFill.height = "8px";
    healthFill.cornerRadius = 4;
    healthFill.thickness = 0;
    healthFill.background = this.team === "enemy" ? "#ef4444" : "#38bdf8";
    healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    healthFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    healthFill.top = "3px";

    const healthLabel = new TextBlock(`${this.id}-health-label`, `${this.health}/${this.maxHealth}`);
    healthLabel.color = "#f8fafc";
    healthLabel.fontSize = 10;
    healthLabel.fontFamily = "Trebuchet MS";
    healthLabel.top = "-4px";

    healthRoot.addControl(healthFill);
    healthRoot.addControl(healthLabel);
    options.ui.addControl(healthRoot);

    this.healthRoot = healthRoot;
    this.healthFill = healthFill;
    this.healthLabel = healthLabel;

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

  public canAttack(unit: BaseUnit, nowMs: number): boolean {
    if (!this.isAlive() || !unit.isAlive() || unit.team === this.team) {
      return false;
    }

    const isCooldownReady = nowMs - this.lastAttackAt >= this.attackCooldownMs;
    if (!isCooldownReady) {
      return false;
    }

    return this.getDistanceToUnit(unit) <= this.getAttackRange();
  }

  public tryAttack(unit: BaseUnit, nowMs: number): boolean {
    if (!this.canAttack(unit, nowMs)) {
      return false;
    }

    unit.takeDamage(this.attackDamage);
    this.lastAttackAt = nowMs;
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
    this.healthRoot.dispose();
    this.destroyedMaterial.dispose();
  }

  private updateHealthBar(): void {
    const percentage = this.maxHealth === 0 ? 0 : (this.health / this.maxHealth) * 100;
    this.healthFill.width = `${percentage}%`;
    this.healthLabel.text = `${Math.ceil(this.health)}/${this.maxHealth}`;
    this.healthRoot.alpha = this.isAlive() ? 1 : 0.75;
  }
}
