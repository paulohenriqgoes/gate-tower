import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import type { SimulationTickContext } from "../battle/SimulationClock";
import type { TeamId } from "../battle/BattleTypes";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import { TowerActor } from "../towers/TowerActor";
import type { BaseUnit } from "../units/BaseUnit";
import { UnitFactory } from "../units/UnitFactory";

export interface CombatArenaTowerDefinition {
  diameter: number;
  id: string;
  lane: "left" | "center" | "right";
  mesh: Mesh;
  team: TeamId;
}

export interface CombatArenaLayout {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
  playerDeploymentMaxZ: number;
  unitGroundY: number;
}

export interface CombatEngineOptions {
  arenaLayout: CombatArenaLayout;
  arenaRoot: TransformNode;
  cardDeckSystem: CardDeckSystem;
  scene: Scene;
  towerAttackCooldownMs: number;
  towerAttackDamage: number;
  towerAttackRangeMultiplier: number;
  towerDefinitions: CombatArenaTowerDefinition[];
  towerMaxHealth: number;
}

interface PendingDeployCommand {
  cardId: string;
  localPoint: Vector3;
  scheduledTick: number;
  sequence: number;
  team: TeamId;
}

export class CombatEngine {
  private readonly arenaLayout: CombatArenaLayout;
  private readonly arenaRoot: TransformNode;
  private readonly cardDeckSystem: CardDeckSystem;
  private readonly scene: Scene;
  private readonly towers: TowerActor[];
  private readonly unitFactory: UnitFactory;

  private readonly pointerObserver: Observer<unknown>;
  private readonly units: BaseUnit[] = [];
  private readonly pendingDeployCommands: PendingDeployCommand[] = [];
  private currentSimulationTick = 0;
  private nextCommandSequence = 0;

  public constructor(options: CombatEngineOptions) {
    this.arenaLayout = options.arenaLayout;
    this.arenaRoot = options.arenaRoot;
    this.cardDeckSystem = options.cardDeckSystem;
    this.scene = options.scene;
    const towerAttackRange = (options.towerDefinitions[0]?.diameter ?? 0)
      * options.towerAttackRangeMultiplier;
    this.unitFactory = new UnitFactory(this.scene, options.towerMaxHealth, towerAttackRange);

    this.towers = options.towerDefinitions.map((towerDefinition) => {
      return new TowerActor({
        attackCooldownMs: options.towerAttackCooldownMs,
        attackDamage: options.towerAttackDamage,
        attackRangeMultiplier: options.towerAttackRangeMultiplier,
        diameter: towerDefinition.diameter,
        id: towerDefinition.id,
        lane: towerDefinition.lane,
        maxHealth: options.towerMaxHealth,
        mesh: towerDefinition.mesh,
        scene: this.scene,
        team: towerDefinition.team,
      });
    });

    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
        return;
      }

      const pickedPoint = pointerInfo.pickInfo?.pickedPoint ?? null;
      if (!pickedPoint) {
        return;
      }

      this.queueDeploySelectedCardAtWorldPoint(pickedPoint);
    });
  }

  public dispose(): void {
    this.scene.onPointerObservable.remove(this.pointerObserver);
    this.pendingDeployCommands.length = 0;

    for (const tower of this.towers) {
      tower.dispose();
    }

    for (const unit of this.units) {
      unit.dispose();
    }
  }

  public advanceSimulationTick(context: SimulationTickContext): void {
    this.currentSimulationTick = context.currentTick;
    this.processPendingDeployCommands();

    for (const unit of this.units) {
      if (!unit.isAlive()) {
        continue;
      }

      const currentTarget = unit.getTargetTower();
      if (!currentTarget || !currentTarget.isAlive()) {
        unit.setTargetTower(this.findNearestAliveTower(this.resolveEnemyTeam(unit.team), unit.root.position));
      }

      unit.update(context.tickDurationSeconds, context.currentTick);
    }

    for (const tower of this.towers) {
      if (!tower.isAlive()) {
        continue;
      }

      const targetUnit = this.findNearestAliveEnemyUnit(tower.team, tower.mesh.position, tower.getAttackRange());
      if (!targetUnit) {
        continue;
      }

      tower.tryAttack(targetUnit, context.currentTick);
    }

    this.cleanupDefeatedUnits();
  }

  private queueDeploySelectedCardAtWorldPoint(worldPoint: Vector3): boolean {
    if (!this.arenaRoot.isEnabled()) {
      return false;
    }

    const selectedCard = this.cardDeckSystem.getSelectedCard();
    if (!selectedCard) {
      return false;
    }

    const localPoint = this.convertWorldToArenaLocal(worldPoint);
    this.pendingDeployCommands.push({
      cardId: selectedCard.id,
      localPoint,
      scheduledTick: this.currentSimulationTick + 1,
      sequence: this.nextCommandSequence,
      team: "player",
    });
    this.nextCommandSequence += 1;

    return true;
  }

  private processPendingDeployCommands(): void {
    if (!this.pendingDeployCommands.length) {
      return;
    }

    this.pendingDeployCommands.sort((left, right) => {
      if (left.scheduledTick === right.scheduledTick) {
        return left.sequence - right.sequence;
      }

      return left.scheduledTick - right.scheduledTick;
    });

    const remainingCommands: PendingDeployCommand[] = [];

    for (const command of this.pendingDeployCommands) {
      if (command.scheduledTick > this.currentSimulationTick) {
        remainingCommands.push(command);
        continue;
      }

      this.tryDeployCardAtLocalPoint(command);
    }

    this.pendingDeployCommands.length = 0;
    this.pendingDeployCommands.push(...remainingCommands);
  }

  private tryDeployCardAtLocalPoint(command: PendingDeployCommand): boolean {
    const spawnPosition = this.getValidSpawnPosition(command.localPoint);
    if (!spawnPosition) {
      return false;
    }

    const enemyTeam = this.resolveEnemyTeam(command.team);
    const targetTower = this.findNearestAliveTower(enemyTeam, spawnPosition);
    if (!targetTower) {
      return false;
    }

    const createdUnits = this.unitFactory.createUnits(command.cardId, spawnPosition, command.team);
    if (!createdUnits.length) {
      return false;
    }

    const consumedCard = this.cardDeckSystem.tryConsumeCard(command.cardId);
    if (!consumedCard) {
      for (const createdUnit of createdUnits) {
        createdUnit.dispose();
      }
      return false;
    }

    for (const createdUnit of createdUnits) {
      createdUnit.root.parent = this.arenaRoot;
      createdUnit.setTargetTower(this.findNearestAliveTower(enemyTeam, createdUnit.root.position) ?? targetTower);
      this.units.push(createdUnit);
    }

    return true;
  }

  private cleanupDefeatedUnits(): void {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const unit = this.units[index];

      if (unit.isAlive()) {
        continue;
      }

      unit.dispose();
      this.units.splice(index, 1);
    }
  }

  private convertWorldToArenaLocal(worldPoint: Vector3): Vector3 {
    this.arenaRoot.computeWorldMatrix(true);
    const invertedWorld = Matrix.Invert(this.arenaRoot.getWorldMatrix());
    return Vector3.TransformCoordinates(worldPoint, invertedWorld);
  }

  private getValidSpawnPosition(localPoint: Vector3): Vector3 | null {
    if (localPoint.z > this.arenaLayout.playerDeploymentMaxZ) {
      return null;
    }

    if (localPoint.x < this.arenaLayout.minX || localPoint.x > this.arenaLayout.maxX) {
      return null;
    }

    if (localPoint.z < this.arenaLayout.minZ || localPoint.z > this.arenaLayout.maxZ) {
      return null;
    }

    return new Vector3(
      Scalar.Clamp(localPoint.x, this.arenaLayout.minX + 0.8, this.arenaLayout.maxX - 0.8),
      this.arenaLayout.unitGroundY,
      Scalar.Clamp(localPoint.z, this.arenaLayout.minZ + 0.8, this.arenaLayout.playerDeploymentMaxZ)
    );
  }

  private findNearestAliveTower(team: TeamId, position: Vector3): TowerActor | null {
    const aliveTowers = this.towers.filter((tower) => tower.team === team && tower.isAlive());

    if (!aliveTowers.length) {
      return null;
    }

    let nearestTower: TowerActor | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const tower of aliveTowers) {
      const distance = tower.mesh.position.subtract(position).length();
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTower = tower;
      }
    }

    return nearestTower;
  }

  private resolveEnemyTeam(team: TeamId): TeamId {
    return team === "player" ? "enemy" : "player";
  }

  private findNearestAliveEnemyUnit(team: TeamId, position: Vector3, maxRange: number): BaseUnit | null {
    let nearestUnit: BaseUnit | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const unit of this.units) {
      if (!unit.isAlive() || unit.team === team) {
        continue;
      }

      const distance = unit.root.position.subtract(position).length();
      if (distance > maxRange || distance >= nearestDistance) {
        continue;
      }

      nearestDistance = distance;
      nearestUnit = unit;
    }

    return nearestUnit;
  }
}
