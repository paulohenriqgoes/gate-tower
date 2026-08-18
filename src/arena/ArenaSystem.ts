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
import { attachProximityFade } from "../fx/proximityFade";
import { CAP_DIAMETER_XZ, createMushroomTower, type MushroomTower } from "../towers/MushroomTower";

/**
 * Arena de escala de sala: 1 unidade do Babylon = 1 metro, nos dois modos de
 * renderizacao (`src/arena/metrics.ts`). A Etapa 1 tinha a cena autorada numa
 * unidade a parte (tile = 2 unidades) e UM fator de escala global unico
 * (extinto nesta etapa) aplicado no `arenaRoot` em RA, que produzia uma
 * maquete de 80 cm. A v3 quer o oposto — objetos de escala de sala — entao
 * agora cada ator (torre, tropa, arena) e autorado direto em metros.
 *
 * PROVISORIO: o campo abaixo e um QUADRADO de 4,4 m x 4,4 m — o diametro do
 * arco polar de raio 2,2 m que a spec v3 pede. A forma retangular/quadrada e
 * so um placeholder; a Etapa 3 substitui isto pela geometria de arco de
 * verdade (`ArenaArc.ts`).
 */
export const ARENA_WIDTH_METERS = 4.4;
export const ARENA_LENGTH_METERS = 4.4;

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

/**
 * Fator interno para os poucos literais deste arquivo que nao tem alvo
 * nomeado em `metrics.ts` (espessura do tile, altura de spawn de unidade,
 * offset do blob de contato da torre): razao entre o novo `tileSize` (0,55 m)
 * e o tileSize autoral da Etapa 1 (2 unidades). Mantem esses detalhes no
 * mesmo tamanho RELATIVO ao tile que tinham antes, sem inventar um segundo
 * fator de conversao do jogo inteiro.
 */
const ARENA_DETAIL_SCALE = 0.55 / 2;

/**
 * Posicao de fallback quando ainda nao ha camera ativa (um frame ou outro
 * durante a troca de modo). Longe o bastante para o fade ficar em 1 — sem isso
 * a torre piscaria invisivel exatamente na transicao RA <-> canvas. E uma
 * constante de modulo, e nao um `Vector3.Zero()` por chamada, porque este
 * getter roda a cada frame por torre e alocar em loop de render e o tipo de
 * lixo que so aparece como GC stutter em mobile.
 */
const FAR_FROM_ARENA = new Vector3(0, 0, 1e6);

export class ArenaSystem {
  private readonly scene: Scene;
  /** Fades de proximidade ligados as torres, para poder soltar tudo em `dispose`. */
  private readonly fadeHandles: Array<{ dispose(): void }> = [];

  // 8 x 8 tiles de 0,55 m = 4,4 m x 4,4 m — o quadrado provisorio desta etapa
  // (ver docblock do arquivo). O grid e derivado das constantes metricas para
  // nao existir duas fontes de verdade do tamanho da arena.
  private readonly tileSize = 0.55;
  private readonly gridX = ARENA_WIDTH_METERS / this.tileSize;
  private readonly gridZ = ARENA_LENGTH_METERS / this.tileSize;

  /** Meia-largura do caminho central, em metros: cobre 1 tile a cada lado do centro (tiles x em {-1, 0}). */
  private readonly laneHalfWidth = this.tileSize;
  /** Distancia do centro ate cada torre, no eixo Z, em metros — valor fixo pedido pela Etapa 2. */
  private readonly towerZ = 2.0;

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Solta os observers de frame criados por esta arena.
   *
   * Ninguem chama isto ainda — a arena vive o carregamento inteiro da pagina
   * hoje. Passa a importar na Etapa 11, quando "jogar de novo" tiver que
   * derrubar e reconstruir a arena sem recarregar: um fade orfao continuaria
   * rodando por frame contra um mesh ja descartado.
   */
  public dispose(): void {
    for (const handle of this.fadeHandles) {
      handle.dispose();
    }
    this.fadeHandles.length = 0;
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
            height: 0.2 * ARENA_DETAIL_SCALE,
          },
          this.scene
        );

        tile.position = new Vector3(
          x * this.tileSize + this.tileSize / 2,
          0.1 * ARENA_DETAIL_SCALE,
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
        unitGroundY: 0.5 * ARENA_DETAIL_SCALE,
        laneCenterX: 0,
        laneHalfWidth: this.laneHalfWidth,
      },
      root: arenaRoot,
      ground: baseGround,
      towerDefinitions: towerMeshes.map((mesh) => {
        const [, team, lane] = mesh.name.split("-");
        return {
          // Diametro REAL do chapeu (nao mais um numero solto): `CombatEngine`
          // deriva alcance de ataque e `TowerActor` a largura da barra de vida
          // a partir dele.
          diameter: CAP_DIAMETER_XZ,
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
    // Blob 1,25x o diametro REAL do chapeu (`CAP_DIAMETER_XZ`, de
    // `MushroomTower.ts`) — antes era o literal solto `2`, que nao acompanhava
    // a torre se `TOWER_HEIGHT_M`/`TOWER_SCALE` mudassem.
    this.addContactBlob(arenaRoot, 0, -this.towerZ, CAP_DIAMETER_XZ * 1.25);

    const enemy = createMushroomTower(this.scene, { lane, team: "enemy", x: 0, z: this.towerZ });
    enemy.root.parent = arenaRoot;
    this.addContactBlob(arenaRoot, 0, this.towerZ, CAP_DIAMETER_XZ * 1.25);

    // Fade por proximidade: com 1,20 m de altura, a torre deixou de ser uma
    // peca de maquete que o jogador olha de cima e virou um objeto que ele
    // ENCOSTA. Sem isto o near plane corta o cogumelo ao meio e expoe o
    // interior oco da malha — o jeito mais rapido de matar a ilusao de RA.
    this.attachTowerFade(player);
    this.attachTowerFade(enemy);

    return { player, enemy };
  }

  /**
   * Liga o fade por proximidade a uma torre.
   *
   * A posicao da camera vem de `scene.activeCamera` a cada frame de proposito:
   * em RA quem dirige essa camera e o engine do 8th Wall (pose 6DoF injetada
   * por frame), e no modo canvas e a camera comum. Ler daqui mantem a regra
   * identica nos dois modos, sem o Arena System saber qual esta ativo.
   */
  private attachTowerFade(tower: MushroomTower): void {
    this.fadeHandles.push(
      attachProximityFade(tower.root, () => this.scene.activeCamera?.globalPosition ?? FAR_FROM_ARENA)
    );
  }

  /** Sombra de contato (blob) sob uma torre, para ancora-la ao piso. */
  private addContactBlob(parent: TransformNode, x: number, z: number, diameter: number): void {
    const blob = createContactShadow(this.scene, { diameter, opacity: 0.4, name: `tower-shadow-${x}-${z}` });
    blob.parent = parent;
    blob.position.set(x, 0.02 * ARENA_DETAIL_SCALE, z);
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
