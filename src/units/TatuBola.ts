import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { createMatteMaterial, PALETTE, shadeHex } from "../fx/materials";
import { BaseUnit, type BaseUnitOptions } from "./BaseUnit";

export interface TatuBolaOptions extends Omit<
  BaseUnitOptions,
  "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"
> {}

/**
 * Quarta criatura (Etapa 9): corpo a corpo medio, entre o Javali (rapido e
 * fragil) e o Cururu (lento e tanque) na curva de custo 2/3/4/5.
 */
export class TatuBola extends BaseUnit {
  private headNode!: TransformNode;

  public constructor(options: TatuBolaOptions) {
    super({
      ...options,
      attackIntervalMs: 1200,
      // Corpo-a-corpo: encosta na torre. Depende do tamanho do casco (1.7 de
      // diametro), nao do tamanho do campo — mesmo raciocinio do Javali/Cururu.
      contactRange: 1.6,
      displayName: "Tatu Bola",
      health: 350,
      // Meio-termo deliberado entre Javali (200hp / 1.3) e Cururu (600hp /
      // 0.85): mais resistente que o primeiro, mais rapido que o segundo.
      // 20 unidades entre torres / 1.05 ~= 19 s de travessia — o alvo pedido
      // para a carta de custo 3.
      movementSpeed: 1.05,
    });
  }

  protected createVisual(): void {
    const shellMaterial = createMatteMaterial(this.scene, PALETTE.accentTatu, `${this.id}-shell-material`);
    const bandMaterial = createMatteMaterial(
      this.scene,
      // Faixas do casco um tom mais escuro que o casco: "escuro na base,
      // claro no topo" do guideline aplicado as bandas em vez da silhueta
      // inteira, ja que aqui a base e o topo sao a mesma esfera.
      shadeHex(PALETTE.accentTatu, 0.55),
      `${this.id}-band-material`
    );
    const darkMaterial = createMatteMaterial(this.scene, PALETTE.neutralDark, `${this.id}-dark-material`);
    const eyeMaterial = createMatteMaterial(this.scene, PALETTE.neutralLight, `${this.id}-eye-material`);
    const pupilMaterial = createMatteMaterial(this.scene, PALETTE.neutralDark, `${this.id}-pupil-material`);

    // Casco em esfera — contraste deliberado com os corpos em caixa do
    // Javali/Cururu, pra ler "bola" a distancia e de cima (teste de silhueta
    // do guideline).
    const shell = MeshBuilder.CreateSphere(
      `${this.id}-shell`,
      {
        diameter: 1.7,
        segments: 10,
      },
      this.scene
    );
    shell.parent = this.visualRoot;
    shell.position.y = 0.95;
    shell.scaling.y = 0.82;
    shell.material = shellMaterial;

    // Faixas transversais do casco (os segmentos do tatu), espacadas ao
    // longo do eixo de deslocamento.
    for (const z of [-0.42, 0, 0.42]) {
      const band = MeshBuilder.CreateTorus(
        `${this.id}-band-${z}`,
        {
          diameter: 1.66,
          thickness: 0.08,
          tessellation: 16,
        },
        this.scene
      );
      band.parent = this.visualRoot;
      band.position = new Vector3(0, 0.95, z);
      band.scaling.y = 0.82;
      band.material = bandMaterial;
    }

    // No intermediario que agrupa cabeca, focinho e olhos, para o estado
    // "observando" do comportamento ocioso poder girar so a cabeca (ver
    // getHeadNode()).
    this.headNode = new TransformNode(`${this.id}-head-node`, this.scene);
    this.headNode.parent = this.visualRoot;
    this.headNode.position = new Vector3(0, 0.78, 0.82);

    const head = MeshBuilder.CreateSphere(
      `${this.id}-head`,
      {
        diameter: 0.62,
        segments: 8,
      },
      this.scene
    );
    head.parent = this.headNode;
    head.material = shellMaterial;

    const snout = MeshBuilder.CreateBox(
      `${this.id}-snout`,
      {
        width: 0.22,
        height: 0.2,
        depth: 0.26,
      },
      this.scene
    );
    snout.parent = this.headNode;
    snout.position = new Vector3(0, -0.08, 0.28);
    snout.material = darkMaterial;

    for (const x of [-0.16, 0.16]) {
      const eye = MeshBuilder.CreateSphere(
        `${this.id}-eye-${x}`,
        {
          diameter: 0.16,
          segments: 8,
        },
        this.scene
      );
      eye.parent = this.headNode;
      eye.position = new Vector3(x, 0.08, 0.24);
      eye.material = eyeMaterial;

      const pupil = MeshBuilder.CreateSphere(
        `${this.id}-pupil-${x}`,
        {
          diameter: 0.07,
          segments: 6,
        },
        this.scene
      );
      pupil.parent = this.headNode;
      pupil.position = new Vector3(x, 0.08, 0.31);
      pupil.material = pupilMaterial;
    }

    const legOffsets: Array<[number, number]> = [
      [-0.5, -0.4],
      [0.5, -0.4],
      [-0.5, 0.4],
      [0.5, 0.4],
    ];

    for (const [x, z] of legOffsets) {
      const leg = MeshBuilder.CreateBox(
        `${this.id}-leg-${x}-${z}`,
        {
          width: 0.26,
          height: 0.4,
          depth: 0.26,
        },
        this.scene
      );
      leg.parent = this.visualRoot;
      leg.position = new Vector3(x, 0.24, z);
      leg.material = darkMaterial;
    }

    const tail = MeshBuilder.CreateBox(
      `${this.id}-tail`,
      {
        width: 0.16,
        height: 0.16,
        depth: 0.42,
      },
      this.scene
    );
    tail.parent = this.visualRoot;
    tail.position = new Vector3(0, 0.68, -0.98);
    tail.rotation.x = 0.32;
    tail.material = bandMaterial;
  }

  public getHeadNode(): TransformNode | null {
    return this.headNode;
  }

  protected computeAttackDamage(): number {
    // Investida constante, sem curva — o contraste dos outros tres: o Javali
    // cresce com a distancia percorrida, o Cururu cresce com a vida perdida.
    return 55;
  }
}
