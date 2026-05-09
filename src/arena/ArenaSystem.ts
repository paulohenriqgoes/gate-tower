import type { TeamId, TowerLaneId } from "../battle/BattleTypes";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

export interface ArenaBuildResult {
  arenaLayout: ArenaLayout;
  root: TransformNode;
  ground: Mesh;
  towerDefinitions: ArenaTowerDefinition[];
  towerMeshes: Mesh[];
}

export interface ArenaLayout {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
  playerDeploymentMaxZ: number;
  unitGroundY: number;
}

export interface ArenaTowerDefinition {
  diameter: number;
  id: string;
  lane: TowerLaneId;
  mesh: Mesh;
  team: TeamId;
}

export class ArenaSystem {
  private readonly scene: Scene;

  private readonly tileSize = 2;
  private readonly gridX = 12;
  private readonly gridZ = 18;

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  public buildInitialArena(): ArenaBuildResult {
    const arenaRoot = new TransformNode("arena-root", this.scene);

    const baseGround = MeshBuilder.CreateGround(
      "arena-ground",
      {
        width: this.gridX * this.tileSize,
        height: this.gridZ * this.tileSize,
      },
      this.scene
    );
    baseGround.parent = arenaRoot;

    const pathMaterial = this.createPatternMaterial(
      "path-material",
      "#c79d3b",
      "#e3c06e"
    );
    const riverMaterial = this.createPatternMaterial(
      "river-material",
      "#2a6fa5",
      "#4ea0d6"
    );
    const grassMaterial = this.createPatternMaterial(
      "grass-material",
      "#427f44",
      "#62a65e"
    );

    for (let x = -this.gridX / 2; x < this.gridX / 2; x += 1) {
      for (let z = -this.gridZ / 2; z < this.gridZ / 2; z += 1) {
        const tile = MeshBuilder.CreateBox(
          `tile-${x}-${z}`,
          {
            width: this.tileSize * 0.98,
            depth: this.tileSize * 0.98,
            height: 0.2,
          },
          this.scene
        );

        tile.position = new Vector3(
          x * this.tileSize + this.tileSize / 2,
          0.1,
          z * this.tileSize + this.tileSize / 2
        );

        const isRiver = z >= -1 && z <= 0;
        const isPathLane = x === -3 || x === 2;

        if (isRiver && !isPathLane) {
          tile.material = riverMaterial;
        } else if (isPathLane) {
          tile.material = pathMaterial;
        } else {
          tile.material = grassMaterial;
        }

        tile.parent = arenaRoot;
      }
    }

    baseGround.position.y = 0;
    baseGround.isVisible = false;

    const towerMeshes = this.createTowerPlaceholders(arenaRoot);

    return {
      arenaLayout: {
        maxX: this.gridX,
        maxZ: this.gridZ,
        minX: -this.gridX,
        minZ: -this.gridZ,
        playerDeploymentMaxZ: -2.2,
        unitGroundY: 0.5,
      },
      root: arenaRoot,
      ground: baseGround,
      towerDefinitions: towerMeshes.map((mesh) => {
        const [, team, lane] = mesh.name.split("-");
        return {
          diameter: 1.6,
          id: mesh.name,
          lane: lane as TowerLaneId,
          mesh,
          team: team === "blue" ? "player" : "enemy",
        };
      }),
      towerMeshes,
    };
  }

  private createTowerPlaceholders(arenaRoot: TransformNode): Mesh[] {
    const blueTowerMaterial = new StandardMaterial("blue-tower-material", this.scene);
    blueTowerMaterial.diffuseColor = Color3.FromHexString("#2f6fff");

    const redTowerMaterial = new StandardMaterial("red-tower-material", this.scene);
    redTowerMaterial.diffuseColor = Color3.FromHexString("#df3e3e");

    const towerDefinitions: Array<{ lane: TowerLaneId; xPosition: number }> = [
      { lane: "left", xPosition: -6 },
      { lane: "center", xPosition: 0 },
      { lane: "right", xPosition: 6 },
    ];
    const towers: Mesh[] = [];

    // Torres simples para validar os lados do campo antes dos modelos finais.
    for (const towerDefinition of towerDefinitions) {
      const blueTower = MeshBuilder.CreateCylinder(
        `tower-blue-${towerDefinition.lane}`,
        { diameter: 1.6, height: 2.8, tessellation: 24 },
        this.scene
      );
      blueTower.position = new Vector3(towerDefinition.xPosition, 1.5, -14);
      blueTower.material = blueTowerMaterial;
      blueTower.parent = arenaRoot;
      towers.push(blueTower);

      const redTower = MeshBuilder.CreateCylinder(
        `tower-red-${towerDefinition.lane}`,
        { diameter: 1.6, height: 2.8, tessellation: 24 },
        this.scene
      );
      redTower.position = new Vector3(towerDefinition.xPosition, 1.5, 14);
      redTower.material = redTowerMaterial;
      redTower.parent = arenaRoot;
      towers.push(redTower);
    }

    return towers;
  }

  private createPatternMaterial(
    name: string,
    baseColorHex: string,
    accentColorHex: string
  ): StandardMaterial {
    const texture = new DynamicTexture(`${name}-texture`, { width: 256, height: 256 }, this.scene, false);
    const context = texture.getContext();

    context.fillStyle = baseColorHex;
    context.fillRect(0, 0, 256, 256);

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if ((row + col) % 2 === 0) {
          context.fillStyle = accentColorHex;
          context.fillRect(col * 32, row * 32, 32, 32);
        }
      }
    }

    texture.update(false);

    const material = new StandardMaterial(name, this.scene);
    material.diffuseTexture = texture;

    return material;
  }
}
