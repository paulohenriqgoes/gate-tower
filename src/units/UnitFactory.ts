import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId } from "../battle/BattleTypes";
import { BaseUnit } from "./BaseUnit";
import { CururuBombado } from "./CururuBombado";
import { DonaBarata } from "./DonaBarata";
import { JavaliRaivoso } from "./JavaliRaivoso";

export class UnitFactory {
  private readonly donaBarataAttackRangeMultiplier = 0.88;
  private readonly scene: Scene;
  private readonly towerAttackRange: number;
  private readonly towerMaxHealth: number;

  public constructor(scene: Scene, towerMaxHealth: number, towerAttackRange: number) {
    this.scene = scene;
    this.towerAttackRange = towerAttackRange;
    this.towerMaxHealth = towerMaxHealth;
  }

  public createUnits(cardId: string, spawnPosition: Vector3, team: TeamId): BaseUnit[] {
    switch (cardId) {
      case "cururu-bombado":
        return [
          new CururuBombado({
            id: this.createUnitId(cardId),
            scene: this.scene,
            spawnPosition,
            team,
            towerMaxHealth: this.towerMaxHealth,
          }),
        ];
      case "dona-barata":
        return this.createDonaBarataSquad(spawnPosition, team);
      case "javali-raivoso":
        return [
          new JavaliRaivoso({
            id: this.createUnitId(cardId),
            scene: this.scene,
            spawnPosition,
            team,
          }),
        ];
      default:
        return [];
    }
  }

  private createDonaBarataSquad(spawnPosition: Vector3, team: TeamId): BaseUnit[] {
    const formationOffsets = [
      new Vector3(-0.65, 0, -0.28),
      new Vector3(0, 0, 0.42),
      new Vector3(0.65, 0, -0.28),
    ];

    return formationOffsets.map((offset, index) => {
      return new DonaBarata({
        attackRange: this.towerAttackRange * this.donaBarataAttackRangeMultiplier,
        id: this.createUnitId(`dona-barata-${index}`),
        scene: this.scene,
        spawnPosition: spawnPosition.add(offset),
        team,
      });
    });
  }

  private createUnitId(cardId: string): string {
    return `${cardId}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  }
}
