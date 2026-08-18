import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId, TowerLaneId } from "../battle/BattleTypes";
import { TOWER_SCALE } from "./MushroomTower";
import { HealthBarMesh } from "../ui/HealthBarMesh";
import type { BaseUnit } from "../units/BaseUnit";

/**
 * Espessura da barra e folga acima da torre eram literais soltos (0.34 e 0.6)
 * calibrados a olho contra a arena da Etapa 1. Reescalados aqui pela razao
 * entre o `TOWER_SCALE` novo e o antigo (1.7) — mesma logica de
 * `CautionSign.ts` — para continuarem na MESMA proporcao visual quando
 * `TOWER_HEIGHT_M` mudar.
 */
const LEGACY_TOWER_SCALE = 1.7;
const TOWER_RESCALE = TOWER_SCALE / LEGACY_TOWER_SCALE;
const HEALTH_BAR_HEIGHT = 0.34 * TOWER_RESCALE;
const HEALTH_BAR_GAP_ABOVE_TOWER = 0.6 * TOWER_RESCALE;

export interface TowerActorOptions {
  attackCooldownMs: number;
  attackDamage: number;
  /**
   * Alcance ja resolvido, em metros. Antes a torre recebia so um
   * multiplicador do proprio diametro e derivava o alcance sozinha; quem
   * decide o alcance e o CombatEngine, que enxerga o campo inteiro.
   */
  attackRange: number;
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
  public readonly attackRange: number;
  public readonly diameter: number;
  public readonly id: string;
  public readonly lane: TowerLaneId;
  public readonly maxHealth: number;
  public readonly mesh: Mesh;
  public readonly team: TeamId;

  private readonly healthBar: HealthBarMesh;
  private readonly destroyedMaterial: StandardMaterial;
  // Material de antes de qualquer dano (Etapa 8, `reset()`) — capturado no
  // construtor porque `receiveDamage` troca `mesh.material` para
  // `destroyedMaterial` quando a torre morre, e a segunda partida precisa
  // devolver o material original, nao so a vida.
  private readonly originalMaterial: Material | null;

  private health: number;
  private lastAttackAt = Number.NEGATIVE_INFINITY;

  public constructor(options: TowerActorOptions) {
    this.attackCooldownMs = options.attackCooldownMs;
    this.attackDamage = options.attackDamage;
    this.attackRange = options.attackRange;
    this.diameter = options.diameter;
    this.id = options.id;
    this.lane = options.lane;
    this.maxHealth = options.maxHealth;
    this.mesh = options.mesh;
    this.team = options.team;
    this.health = options.maxHealth;
    this.originalMaterial = options.mesh.material;

    this.healthBar = new HealthBarMesh({
      borderColorHex: this.team === "enemy" ? "#f87171" : "#7dd3fc",
      emissiveIntensity: 0.35,
      fillColorHex: this.team === "enemy" ? "#ef4444" : "#38bdf8",
      height: HEALTH_BAR_HEIGHT,
      id: this.id,
      parent: this.mesh,
      scene: options.scene,
      // 1.15x o diametro REAL da torre (`this.diameter` agora vem de
      // `CAP_DIAMETER_XZ`, ver `ArenaSystem.ts`) — proporcao preservada da
      // Etapa 1.
      width: this.diameter * 1.15,
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
    return this.attackRange;
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

  /**
   * Volta a torre ao estado de inicio de partida (Etapa 8, "a segunda
   * partida funciona"): vida cheia, material original (nao o cinza de
   * "destruida"), cooldown de ataque liberado. NAO mexe em posicao/malha —
   * so o que uma partida anterior pode ter deixado sujo.
   */
  public reset(): void {
    this.health = this.maxHealth;
    this.lastAttackAt = Number.NEGATIVE_INFINITY;
    this.mesh.material = this.originalMaterial;
    this.updateHealthBar();
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
    return localTop + HEALTH_BAR_GAP_ABOVE_TOWER;
  }
}
