import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId } from "../battle/BattleTypes";
import { BaseUnit } from "./BaseUnit";
import { JavaliRaivoso } from "./JavaliRaivoso";

export class UnitFactory {
  private readonly scene: Scene;

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  public createUnit(cardId: string, spawnPosition: Vector3, team: TeamId): BaseUnit | null {
    switch (cardId) {
      case "javali-raivoso":
        return new JavaliRaivoso({
          id: `${cardId}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          scene: this.scene,
          spawnPosition,
          team,
        });
      default:
        return null;
    }
  }
}
