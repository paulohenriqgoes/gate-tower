import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { createMatteMaterial, PALETTE } from "../fx/materials";
import { BaseUnit, type BaseUnitOptions } from "./BaseUnit";

export interface JavaliRaivosoOptions extends Omit<BaseUnitOptions, "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"> {}

export class JavaliRaivoso extends BaseUnit {
  private headNode!: TransformNode;

  public constructor(options: JavaliRaivosoOptions) {
    super({
      ...options,
      attackIntervalMs: 1100,
      // Corpo-a-corpo: encosta na torre. Nao muda com a arena — depende do
      // tamanho do bicho (1.9 de profundidade), nao do tamanho do campo.
      contactRange: 1.5,
      displayName: "Javali Raivoso",
      health: 200,
      // A distancia entre torres caiu de 28 para 20 unidades. Velocidade
      // calibrada pelo tempo de travessia, nao pelo valor antigo: 20 / 1.3 ~=
      // 15 s, a ponta rapida da janela de 15-25 s pedida para a leitura de jogo.
      movementSpeed: 1.3,
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
        width: 1.6,
        height: 0.9,
        depth: 1.9,
      },
      this.scene
    );
    body.parent = this.visualRoot;
    body.position.y = 0.82;
    body.material = bodyMaterial;

    // No intermediario que agrupa cabeca + presas, para o estado "observando"
    // do comportamento ocioso poder girar so a cabeca (ver getHeadNode()).
    this.headNode = new TransformNode(`${this.id}-head-node`, this.scene);
    this.headNode.parent = this.visualRoot;
    this.headNode.position = new Vector3(0, 0.9, 1.18);

    const head = MeshBuilder.CreateBox(
      `${this.id}-head`,
      {
        width: 1.05,
        height: 0.72,
        depth: 0.88,
      },
      this.scene
    );
    head.parent = this.headNode;
    head.material = bodyMaterial;

    const mane = MeshBuilder.CreateBox(
      `${this.id}-mane`,
      {
        width: 0.36,
        height: 0.54,
        depth: 1.4,
      },
      this.scene
    );
    mane.parent = this.visualRoot;
    mane.position = new Vector3(0, 1.18, 0.12);
    mane.material = maneMaterial;

    const legOffsets: Array<[number, number]> = [
      [-0.48, -0.52],
      [0.48, -0.52],
      [-0.48, 0.52],
      [0.48, 0.52],
    ];

    for (const [x, z] of legOffsets) {
      const leg = MeshBuilder.CreateBox(
        `${this.id}-leg-${x}-${z}`,
        {
          width: 0.24,
          height: 0.72,
          depth: 0.24,
        },
        this.scene
      );
      leg.parent = this.visualRoot;
      leg.position = new Vector3(x, 0.34, z);
      leg.material = maneMaterial;
    }

    for (const x of [-0.25, 0.25]) {
      const fang = MeshBuilder.CreateBox(
        `${this.id}-fang-${x}`,
        {
          width: 0.12,
          height: 0.12,
          depth: 0.34,
        },
        this.scene
      );
      fang.parent = this.headNode;
      // Posicao original (x, 0.7, 1.62) era relativa ao visualRoot; reparentada
      // sob headNode (que fica em (0, 0.9, 1.18)), a posicao local vira a
      // diferenca entre as duas, preservando a aparencia em repouso.
      fang.position = new Vector3(x, -0.2, 0.44);
      fang.material = fangMaterial;
    }
  }

  public getHeadNode(): TransformNode | null {
    return this.headNode;
  }

  protected computeAttackDamage(): number {
    // O dano cresce com a distancia percorrida — uma constante espacial, entao
    // ela acompanha o encolhimento do campo: 28 / 20 = 1.4x por unidade andada,
    // para uma investida de ponta a ponta doer o mesmo de antes.
    const FIELD_SHRINK_COMPENSATION = 1.4;
    return Math.max(1, Math.round(this.getTotalDistanceTravelled() * FIELD_SHRINK_COMPENSATION));
  }
}
