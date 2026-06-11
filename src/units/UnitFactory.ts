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
  private nextUnitSequence = 1;

  public constructor(scene: Scene, towerMaxHealth: number, towerAttackRange: number) {
    this.scene = scene;
    this.towerAttackRange = towerAttackRange;
    this.towerMaxHealth = towerMaxHealth;
  }

  public createUnits(cardId: string, spawnPosition: Vector3, team: TeamId): BaseUnit[] {
    switch (cardId) {
      case "cururu-bombado":
        const cururuIdentity = this.createUnitIdentity(cardId);
        return [
          new CururuBombado({
            id: cururuIdentity.id,
            randomSeed: cururuIdentity.randomSeed,
            scene: this.scene,
            spawnPosition,
            team,
            towerMaxHealth: this.towerMaxHealth,
          }),
        ];
      case "dona-barata":
        return this.createDonaBarataSquad(spawnPosition, team);
      case "javali-raivoso":
        const javaliIdentity = this.createUnitIdentity(cardId);
        return [
          new JavaliRaivoso({
            id: javaliIdentity.id,
            randomSeed: javaliIdentity.randomSeed,
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
      const identity = this.createUnitIdentity(`dona-barata-${index}`);
      return new DonaBarata({
        attackRange: this.towerAttackRange * this.donaBarataAttackRangeMultiplier,
        id: identity.id,
        randomSeed: identity.randomSeed,
        scene: this.scene,
        spawnPosition: spawnPosition.add(offset),
        team,
      });
    });
  }

  private createUnitIdentity(cardId: string): { id: string; randomSeed: number } {
    const sequence = this.nextUnitSequence;
    this.nextUnitSequence += 1;

    return {
      id: `${cardId}-${sequence}`,
      randomSeed: sequence,
    };
  }
}
