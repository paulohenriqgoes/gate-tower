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
   * As torres como cogumelos. Desde a JG-12 sobrou UMA — a inimiga, que e a
   * caverna do Coelho e existe como cenario do Beat 5 (sai na JG-10). A do
   * jogador foi removida: quem apanha agora e o proprio jogador (`PlayerCore`).
   *
   * Quem precisa acender a caverna, abrir os olhos ou saber onde fica a boca
   * precisa do objeto inteiro, e nao so do mesh.
   */
  mushroomTowers: { enemy: MushroomTower };
}

export interface ArenaLayout {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
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
  /**
   * Onde fica a torre INIMIGA, no eixo Z, em metros.
   *
   * PROVISORIO, e so por causa da intro antiga: na v3 nao existe torre inimiga
   * — o jogador defende UMA torre contra ondas (JG-04), e a intro que a JG-10
   * vai escrever nem sequer tem esta torre. Ate la ela sobrevive como o alvo do
   * Beat 5 (aproximar/tocar para acordar), e por isso fica FORA do arco
   * (`ARENA_RADIUS_M` = 2,2 m): dentro dele, ela cairia bem no anel onde os
   * inimigos nascem, e metade dos nascimentos do setor central sairia de dentro
   * dela.
   */
  private readonly introEnemyTowerZ = 2.6;

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
    // A raiz da arena nasce na ORIGEM, sem rotacao, e fica assim para sempre —
    // inclusive em RA. Este e o invariante da fundacao de RA (spec 08, F2): o
    // conteudo e autorado em coordenadas fixas e quem se move e a origem da
    // CAMERA, via `recenter()`. O jogador e o vertice do arco, logo o jogador E
    // a origem, e o `y = 0` daqui e o chao real por declaracao.
    //
    // Nada no projeto pode escrever em `arenaRoot.position` ou
    // `arenaRoot.rotationQuaternion`. Um `arenaRoot` que anda foi exatamente o
    // que fez a arena escorregar debaixo do jogador a cada relocalizacao do
    // SLAM.
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
    const towerMeshes = [mushroomTowers.enemy.body];

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
        unitGroundY: 0.5 * ARENA_DETAIL_SCALE,
        laneCenterX: 0,
        laneHalfWidth: this.laneHalfWidth,
      },
      root: arenaRoot,
      ground: baseGround,
      towerDefinitions: towerMeshes.map((mesh) => {
        const [, team, lane] = mesh.name.split("-");
        return {
          // Diametro REAL do chapeu, nao um numero solto. Ja alimentou o
          // alcance de ataque do combate e a barra de vida da `TowerActor`; hoje
          // so descreve a geometria, porque a unica torre que sobrou nao luta.
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

  private createTowers(arenaRoot: TransformNode): { enemy: MushroomTower } {
    // UMA torre so, a do INIMIGO: a caverna de onde o Coelho sai, cenario do
    // Beat 5 ate a JG-10 reescrever a intro. O nome do `body` segue
    // `tower-<cor>-<lane>` porque `buildInitialArena` deriva team/lane dele.
    //
    // **A torre do JOGADOR nao existe mais** (JG-12). Ela nasceu na JG-04, no
    // vertice do arco, a 0,9 m de quem joga — e a propria spec dela registrou a
    // pergunta que so o playtest responderia: "se a torre a 0,9 m do rosto
    // atrapalha em vez de ocluir". A sessao de device de 2026-08-21 respondeu
    // que sim, por dois caminhos independentes: 57,7% das amostras de distancia
    // da camera cairam dentro do fade e 6,4% com a torre invisivel de tao perto;
    // e as duas partidas terminaram com 100% e 99,1% de vida, porque o ataque
    // automatico dela resolvia a defesa sozinho. Quem apanha agora e o
    // `PlayerCore`, que nao tem malha nenhuma e por isso nao tem como entrar na
    // frente da camera.
    const lane: TowerLaneId = "center";

    const enemy = createMushroomTower(this.scene, {
      lane,
      team: "enemy",
      x: 0,
      z: this.introEnemyTowerZ,
    });
    enemy.root.parent = arenaRoot;
    // Blob 1,25x o diametro REAL do chapeu (`CAP_DIAMETER_XZ`, de
    // `MushroomTower.ts`) — antes era o literal solto `2`, que nao acompanhava
    // a torre se `TOWER_HEIGHT_M`/`TOWER_SCALE` mudassem.
    this.addContactBlob(arenaRoot, 0, this.introEnemyTowerZ, CAP_DIAMETER_XZ * 1.25);

    // Fade por proximidade: com 1,20 m de altura, a torre deixou de ser uma
    // peca de maquete que o jogador olha de cima e virou um objeto que ele
    // ENCOSTA. Sem isto o near plane corta o cogumelo ao meio e expoe o
    // interior oco da malha — o jeito mais rapido de matar a ilusao de RA.
    this.attachTowerFade(enemy);

    return { enemy };
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
