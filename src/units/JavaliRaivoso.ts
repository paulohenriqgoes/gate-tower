import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { TROOP_HEIGHT_M } from "../arena/metrics";
import { createMatteMaterial, PALETTE } from "../fx/materials";
import { BaseUnit, type BaseUnitOptions } from "./BaseUnit";

/**
 * Fator unico que multiplica TODAS as medidas lineares do Javali Raivoso —
 * mesmo espirito do `TOWER_SCALE` de `MushroomTower.ts`. `AUTHORED_HEIGHT` e
 * a extensao em Y da geometria abaixo com fator 1: do fundo da perna (centro
 * 0.34, altura 0.72 -> fundo -0.02) ate o topo da crina (centro 1.18, altura
 * 0.54 -> topo 1.45). `1.45 - (-0.02)` = 1.47. Dividindo `TROOP_HEIGHT_M`
 * (0,35 m) por isso, o Javali passa a medir 0,35 m do pe ao topo da crina.
 */
const AUTHORED_HEIGHT = 1.47;
const UNIT_SCALE = TROOP_HEIGHT_M / AUTHORED_HEIGHT;

export interface JavaliRaivosoOptions extends Omit<BaseUnitOptions, "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"> {}

export class JavaliRaivoso extends BaseUnit {
  private headNode!: TransformNode;

  public constructor(options: JavaliRaivosoOptions) {
    super({
      ...options,
      attackIntervalMs: 1100,
      // Corpo-a-corpo: encosta na torre. Depende do tamanho do bicho (mesmo
      // `UNIT_SCALE` do resto do arquivo), nao do tamanho do campo.
      contactRange: 1.5 * UNIT_SCALE,
      displayName: "Javali Raivoso",
      health: 200,
      // Velocidade escalada pelo mesmo `UNIT_SCALE` do corpo (regra da
      // Etapa 2 para velocidades de unidade).
      movementSpeed: 1.3 * UNIT_SCALE,
    });
  }

  protected createVisual(): void {
    // Corpo em laranja (cor de acento da carta) em vez do marrom original: o
    // guideline proibe marrom/bege como cor dominante mesmo quando o bicho e
    // literalmente marrom na vida real.
    const bodyMaterial = createMatteMaterial(this.scene, PALETTE.accentJavali, `${this.id}-body-material`);
    const maneMaterial = createMatteMaterial(this.scene, PALETTE.neutralDark, `${this.id}-mane-material`);
    const fangMaterial = createMatteMaterial(this.scene, PALETTE.neutralLight, `${this.id}-fang-material`);

    const body = MeshBuilder.CreateBox(
      `${this.id}-body`,
      {
        width: 1.6 * UNIT_SCALE,
        height: 0.9 * UNIT_SCALE,
        depth: 1.9 * UNIT_SCALE,
      },
      this.scene
    );
    body.parent = this.visualRoot;
    body.position.y = 0.82 * UNIT_SCALE;
    body.material = bodyMaterial;

    // No intermediario que agrupa cabeca + presas, para o estado "observando"
    // do comportamento ocioso poder girar so a cabeca (ver getHeadNode()).
    this.headNode = new TransformNode(`${this.id}-head-node`, this.scene);
    this.headNode.parent = this.visualRoot;
    this.headNode.position = new Vector3(0, 0.9 * UNIT_SCALE, 1.18 * UNIT_SCALE);

    const head = MeshBuilder.CreateBox(
      `${this.id}-head`,
      {
        width: 1.05 * UNIT_SCALE,
        height: 0.72 * UNIT_SCALE,
        depth: 0.88 * UNIT_SCALE,
      },
      this.scene
    );
    head.parent = this.headNode;
    head.material = bodyMaterial;

    const mane = MeshBuilder.CreateBox(
      `${this.id}-mane`,
      {
        width: 0.36 * UNIT_SCALE,
        height: 0.54 * UNIT_SCALE,
        depth: 1.4 * UNIT_SCALE,
      },
      this.scene
    );
    mane.parent = this.visualRoot;
    mane.position = new Vector3(0, 1.18 * UNIT_SCALE, 0.12 * UNIT_SCALE);
    mane.material = maneMaterial;

    const legOffsets: Array<[number, number]> = [
      [-0.48 * UNIT_SCALE, -0.52 * UNIT_SCALE],
      [0.48 * UNIT_SCALE, -0.52 * UNIT_SCALE],
      [-0.48 * UNIT_SCALE, 0.52 * UNIT_SCALE],
      [0.48 * UNIT_SCALE, 0.52 * UNIT_SCALE],
    ];

    for (const [x, z] of legOffsets) {
      const leg = MeshBuilder.CreateBox(
        `${this.id}-leg-${x}-${z}`,
        {
          width: 0.24 * UNIT_SCALE,
          height: 0.72 * UNIT_SCALE,
          depth: 0.24 * UNIT_SCALE,
        },
        this.scene
      );
      leg.parent = this.visualRoot;
      leg.position = new Vector3(x, 0.34 * UNIT_SCALE, z);
      leg.material = maneMaterial;
    }

    for (const x of [-0.25 * UNIT_SCALE, 0.25 * UNIT_SCALE]) {
      const fang = MeshBuilder.CreateBox(
        `${this.id}-fang-${x}`,
        {
          width: 0.12 * UNIT_SCALE,
          height: 0.12 * UNIT_SCALE,
          depth: 0.34 * UNIT_SCALE,
        },
        this.scene
      );
      fang.parent = this.headNode;
      // Posicao original (x, 0.7, 1.62) era relativa ao visualRoot; reparentada
      // sob headNode (que fica em (0, 0.9, 1.18)), a posicao local vira a
      // diferenca entre as duas, preservando a aparencia em repouso.
      fang.position = new Vector3(x, -0.2 * UNIT_SCALE, 0.44 * UNIT_SCALE);
      fang.material = fangMaterial;
    }
  }

  public getHeadNode(): TransformNode | null {
    return this.headNode;
  }

  protected computeAttackDamage(): number {
    // O dano cresce com a distancia percorrida — proporcao adimensional,
    // NAO uma constante espacial (nao escala com `UNIT_SCALE`): 1.4 pontos
    // de dano por metro andado e uma decisao de balanceamento, e recalibrar
    // isso para a nova escala fica para uma etapa de balanceamento, nao esta.
    const FIELD_SHRINK_COMPENSATION = 1.4;
    return Math.max(1, Math.round(this.getTotalDistanceTravelled() * FIELD_SHRINK_COMPENSATION));
  }
}
