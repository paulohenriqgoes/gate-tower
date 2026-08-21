import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId } from "../battle/BattleTypes";
import { BaseUnit } from "./BaseUnit";
import { CururuBombado } from "./CururuBombado";
import { DonaBarata, DONA_BARATA_UNIT_SCALE } from "./DonaBarata";
import { JavaliRaivoso } from "./JavaliRaivoso";
import { TatuBola } from "./TatuBola";

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
            cardId,
            id: this.createUnitId(cardId),
            scene: this.scene,
            spawnPosition,
            team,
            towerMaxHealth: this.towerMaxHealth,
          }),
        ];
      case "dona-barata":
        return this.createDonaBarataSquad(cardId, spawnPosition, team);
      case "javali-raivoso":
        return [
          new JavaliRaivoso({
            cardId,
            id: this.createUnitId(cardId),
            scene: this.scene,
            spawnPosition,
            team,
          }),
        ];
      case "tatu-bola":
        return [
          new TatuBola({
            cardId,
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

  private createDonaBarataSquad(cardId: string, spawnPosition: Vector3, team: TeamId): BaseUnit[] {
    // Espacamento do esquadrao: proporcional ao corpo da propria Dona Barata,
    // entao usa o MESMO fator dela (`DONA_BARATA_UNIT_SCALE`) em vez de um
    // numero solto — ver o docblock de escala em `DonaBarata.ts`.
    const formationOffsets = [
      new Vector3(-0.65 * DONA_BARATA_UNIT_SCALE, 0, -0.28 * DONA_BARATA_UNIT_SCALE),
      new Vector3(0, 0, 0.42 * DONA_BARATA_UNIT_SCALE),
      new Vector3(0.65 * DONA_BARATA_UNIT_SCALE, 0, -0.28 * DONA_BARATA_UNIT_SCALE),
    ];

    return formationOffsets.map((offset, index) => {
      return new DonaBarata({
        attackRange: this.towerAttackRange * this.donaBarataAttackRangeMultiplier,
        cardId,
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
