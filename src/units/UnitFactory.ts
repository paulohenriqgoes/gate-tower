import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId } from "../battle/BattleTypes";
import { BaseUnit } from "./BaseUnit";
import { CururuBombado } from "./CururuBombado";
import { JavaliRaivoso } from "./JavaliRaivoso";

export class UnitFactory {
  private readonly scene: Scene;
  private readonly towerMaxHealth: number;

  public constructor(scene: Scene, towerMaxHealth: number) {
    this.scene = scene;
    this.towerMaxHealth = towerMaxHealth;
  }

  public createUnit(cardId: string, spawnPosition: Vector3, team: TeamId): BaseUnit | null {
    switch (cardId) {
      case "cururu-bombado":
        return new CururuBombado({
          id: `${cardId}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          scene: this.scene,
          spawnPosition,
          team,
          towerMaxHealth: this.towerMaxHealth,
        });
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
