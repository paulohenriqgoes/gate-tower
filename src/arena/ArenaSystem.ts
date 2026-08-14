import type { TeamId, TowerLaneId } from "../battle/BattleTypes";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { createContactShadow } from "../fx/contactShadow";
import { applyMatteFinish, PALETTE } from "../fx/materials";
import { createMushroomTower, type MushroomTower } from "../towers/MushroomTower";

/**
 * Arena de mesa: o maior eixo da arena mede 80 cm no mundo real.
 *
 * A cena continua autorada nas unidades originais (tile = 2 unidades) e a
 * conversao para metros e UM fator unico, aplicado no root em RA. A alternativa
 * — reautorar tudo em metros com escala 1 — obrigaria a dividir por ~30 toda
 * constante espacial de unidades, barras de vida, blobs e animacao de spawn,
 * espalhando numeros magicos. O preco desta escolha e a arena viver em escala
 * ~0.03, que e onde shadow-mapping quebra; como o grounding aqui e feito por
 * blob de contato (`src/fx/contactShadow.ts`), esse preco nao se materializa.
 */
export const ARENA_LENGTH_METERS = 0.8;
/** Maior eixo da arena em unidades autorais: 12 tiles * 2 no eixo Z. */
export const ARENA_AUTHORED_DEPTH = 24;
/** Menor eixo da arena em unidades autorais: 8 tiles * 2 no eixo X. */
export const ARENA_AUTHORED_WIDTH = 16;
/** Fator unico e fixo de conversao autoral -> metros no modo RA (~0.03333). */
export const AR_ARENA_SCALE = ARENA_LENGTH_METERS / ARENA_AUTHORED_DEPTH;
/** Menor eixo da arena em metros (~0.533 m). */
export const ARENA_WIDTH_METERS = ARENA_AUTHORED_WIDTH * AR_ARENA_SCALE;

export interface ArenaBuildResult {
  arenaLayout: ArenaLayout;
  root: TransformNode;
  ground: Mesh;
  towerDefinitions: ArenaTowerDefinition[];
  towerMeshes: Mesh[];
  /**
   * As torres como cogumelos, indexadas por time. `towerMeshes` continua
   * entregando so o mesh (e o que o combate precisa); quem precisa acender a
   * caverna, abrir os olhos ou saber onde fica a boca — o Beat 5 por
   * aproximacao — precisa do objeto inteiro.
   */
  mushroomTowers: Record<TeamId, MushroomTower>;
}

export interface ArenaLayout {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
  /** Metade do jogador: so da para invocar em z <= este valor. */
  playerDeploymentMaxZ: number;
  unitGroundY: number;
  /** Centro do caminho unico que liga as duas torres. */
  laneCenterX: number;
  /** Meia-largura do caminho (o caminho vai de -laneHalfWidth a +laneHalfWidth). */
  laneHalfWidth: number;
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

  // 8 x 12 tiles de 2 unidades = 16 x 24 unidades autorais, que em RA viram
  // 0,53 m x 0,80 m — a arena de mesa da demo. O grid e derivado das constantes
  // metricas para nao existir duas fontes de verdade do tamanho da arena.
  private readonly tileSize = 2;
  private readonly gridX = ARENA_AUTHORED_WIDTH / this.tileSize;
  private readonly gridZ = ARENA_AUTHORED_DEPTH / this.tileSize;

  /** Meia-largura do caminho central, em unidades autorais (tiles x em {-1, 0}). */
  private readonly laneHalfWidth = 2;
  /** Distancia do centro ate cada torre, no eixo Z. */
  private readonly towerZ = 10;

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  public buildInitialArena(): ArenaBuildResult {
    const arenaRoot = new TransformNode("arena-root", this.scene);

    // Todos os tiles (o "grid" xadrez) ficam sob este no para poder ser
    // escondido de uma vez no modo RA (o xadrez denuncia que a arena e um plano
    // flutuante; sem ele, ficam so torres/unidades + as sombras de contato).
    const gridNode = new TransformNode("arena-grid", this.scene);
    gridNode.parent = arenaRoot;

    const baseGround = MeshBuilder.CreateGround(
      "arena-ground",
      {
        width: this.gridX * this.tileSize,
        height: this.gridZ * this.tileSize,
      },
      this.scene
    );
    baseGround.parent = arenaRoot;

    // Cores vindas da paleta unica (Etapa 9). O caminho era amarelado
    // (#c79d3b/#e3c06e, bege-mostarda) e virou slate-violeta: cor dominante
    // nunca pode ser marrom/bege pelo guideline, e grama+caminho juntos sao a
    // maior area de tela da arena.
    const pathMaterial = this.createPatternMaterial(
      "path-material",
      PALETTE.pathBase,
      PALETTE.pathAccent
    );
    const riverMaterial = this.createPatternMaterial(
      "river-material",
      PALETTE.riverBase,
      PALETTE.riverAccent
    );
    const grassMaterial = this.createPatternMaterial(
      "grass-material",
      PALETTE.grassBase,
      PALETTE.grassAccent
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

        // Caminho central unico: a faixa de tiles x em {-1, 0}, ou seja mundo
        // x em [-2, 2]. O rio continua sendo so a faixa fina de z em {-1, 0},
        // atravessada pelo caminho — decoracao barata que mantem a leitura de
        // "meio de campo" sem gerar navegacao por lanes.
        const isRiver = z >= -1 && z <= 0;
        const isPathLane = x === -1 || x === 0;

        if (isRiver && !isPathLane) {
          tile.material = riverMaterial;
        } else if (isPathLane) {
          tile.material = pathMaterial;
        } else {
          tile.material = grassMaterial;
        }

        tile.parent = gridNode;
      }
    }

    baseGround.position.y = 0;
    // visibility = 0 (e nao isVisible = false) para ficar invisivel ao olho MAS
    // continuar pickavel: e ele o plano de toque do deploy agora que os tiles do
    // grid ficam escondidos em RA (isVisible=false tiraria a mesh do picking).
    baseGround.visibility = 0;

    const mushroomTowers = this.createTowers(arenaRoot);
    const towerMeshes = [mushroomTowers.player.body, mushroomTowers.enemy.body];

    // Limites derivados de verdade da geometria (metade da extensao do grid).
    // Antes eram `±gridX`/`±gridZ`, que so batia por coincidencia com o grid
    // antigo e passaria a mentir com qualquer outro tamanho de tile.
    const halfWidth = (this.gridX * this.tileSize) / 2;
    const halfDepth = (this.gridZ * this.tileSize) / 2;

    return {
      arenaLayout: {
        maxX: halfWidth,
        maxZ: halfDepth,
        minX: -halfWidth,
        minZ: -halfDepth,
        // O jogador ocupa a metade dele: z <= 0 (o rio marca a divisa).
        playerDeploymentMaxZ: 0,
        unitGroundY: 0.5,
        laneCenterX: 0,
        laneHalfWidth: this.laneHalfWidth,
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
      mushroomTowers,
    };
  }

  private createTowers(arenaRoot: TransformNode): Record<TeamId, MushroomTower> {
    // UMA torre por lado, ambas em x = 0, no fim do caminho central. O nome
    // do `body` segue `tower-<cor>-<lane>` porque `buildInitialArena` deriva
    // team/lane dele — `createMushroomTower` cuida disso internamente.
    const lane: TowerLaneId = "center";

    // Etapa 2: cilindro placeholder virou cogumelo (`MushroomTower.ts`) —
    // aqui so troca a fabrica, o resto (blob de contato, parentesco no
    // `arenaRoot`) continua igual. `root` E o proprio `body`, de proposito:
    // o combate le `mesh.position` esperando a posicao em espaco de arena.
    const player = createMushroomTower(this.scene, { lane, team: "player", x: 0, z: -this.towerZ });
    player.root.parent = arenaRoot;
    // Blob 1.25x o diametro da torre: com a arena 1.5x menor, o antigo 2.4
    // (1.5x) virava uma mancha grande demais para o campo.
    this.addContactBlob(arenaRoot, 0, -this.towerZ, 2);

    const enemy = createMushroomTower(this.scene, { lane, team: "enemy", x: 0, z: this.towerZ });
    enemy.root.parent = arenaRoot;
    this.addContactBlob(arenaRoot, 0, this.towerZ, 2);

    return { player, enemy };
  }

  /** Sombra de contato (blob) sob uma torre, para ancora-la ao piso. */
  private addContactBlob(parent: TransformNode, x: number, z: number, diameter: number): void {
    const blob = createContactShadow(this.scene, { diameter, opacity: 0.4, name: `tower-shadow-${x}-${z}` });
    blob.parent = parent;
    blob.position.set(x, 0.02, z);
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
    // Material texturizado: nao passa por createMatteMaterial (que trabalha
    // com diffuseColor plano), mas ainda precisa do acabamento mate do
    // guideline — zera o especular direto.
    applyMatteFinish(material);

    return material;
  }
}
