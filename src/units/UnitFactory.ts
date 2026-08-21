import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import { DONA_BARATA_ATTACK_RANGE_M, PLAYER_MAX_HEALTH } from "../arena/metrics";
import type { TeamId } from "../battle/BattleTypes";
import { BaseUnit } from "./BaseUnit";
import { CururuBombado } from "./CururuBombado";
import { DonaBarata, DONA_BARATA_UNIT_SCALE } from "./DonaBarata";
import { JavaliRaivoso } from "./JavaliRaivoso";
import { TatuBola } from "./TatuBola";

/**
 * Fabrica de unidades (padrao Factory, `.github/copilot-instructions.md` §2).
 *
 * **Ela deixou de receber parametros de torre na JG-12.** Recebia
 * `towerMaxHealth` e `towerAttackRange`, e derivava deles a vida do Cururu e o
 * alcance de arremesso da Dona Barata — uma heranca da epoca em que existia uma
 * torre de combate de cada lado. Com a torre do jogador removida, os dois
 * numeros passaram a vir direto de `metrics.ts`, que e a fonte unica de tamanho
 * fisico do jogo. Encadear atributo de tropa num atributo de torre morta era o
 * tipo de ligacao que sobrevive a refatoracao e mente depois.
 */
export class UnitFactory {
  private readonly scene: Scene;

  public constructor(scene: Scene) {
    this.scene = scene;
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
            referenceMaxHealth: PLAYER_MAX_HEALTH,
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
        attackRange: DONA_BARATA_ATTACK_RANGE_M,
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
