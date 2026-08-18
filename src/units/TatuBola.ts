import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { TROOP_HEIGHT_M } from "../arena/metrics";
import { createMatteMaterial, PALETTE, shadeHex } from "../fx/materials";
import { BaseUnit, type BaseUnitOptions } from "./BaseUnit";

export interface TatuBolaOptions extends Omit<
  BaseUnitOptions,
  "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"
> {}

/**
 * Fator unico que multiplica TODAS as medidas lineares do Tatu Bola — mesmo
 * espirito do `TOWER_SCALE` de `MushroomTower.ts`. `AUTHORED_HEIGHT` e a
 * extensao em Y da geometria abaixo com fator 1: do fundo da perna (centro
 * 0.24, altura 0.4 -> fundo 0.04) ate o topo do casco (esfera diametro 1.7,
 * centro y=0.95, `scaling.y` = 0.82 -> semi-eixo vertical 0.85*0.82 = 0.697,
 * topo 0.95+0.697 = 1.647). `1.647 - 0.04` = 1.607. Dividindo `TROOP_HEIGHT_M`
 * (0,35 m) por isso, o Tatu passa a medir 0,35 m do pe ao topo do casco.
 */
const AUTHORED_HEIGHT = 1.607;
const UNIT_SCALE = TROOP_HEIGHT_M / AUTHORED_HEIGHT;

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
      // Corpo-a-corpo: encosta na torre. Depende do tamanho do casco (mesmo
      // `UNIT_SCALE` do resto do arquivo), nao do tamanho do campo — mesmo
      // raciocinio do Javali/Cururu.
      contactRange: 1.6 * UNIT_SCALE,
      displayName: "Tatu Bola",
      health: 350,
      // Velocidade escalada pelo mesmo `UNIT_SCALE` do corpo (regra da
      // Etapa 2 para velocidades de unidade).
      movementSpeed: 1.05 * UNIT_SCALE,
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
        diameter: 1.7 * UNIT_SCALE,
        segments: 10,
      },
      this.scene
    );
    shell.parent = this.visualRoot;
    shell.position.y = 0.95 * UNIT_SCALE;
    shell.scaling.y = 0.82;
    shell.material = shellMaterial;

    // Faixas transversais do casco (os segmentos do tatu), espacadas ao
    // longo do eixo de deslocamento.
    for (const z of [-0.42 * UNIT_SCALE, 0, 0.42 * UNIT_SCALE]) {
      const band = MeshBuilder.CreateTorus(
        `${this.id}-band-${z}`,
        {
          diameter: 1.66 * UNIT_SCALE,
          thickness: 0.08 * UNIT_SCALE,
          tessellation: 16,
        },
        this.scene
      );
      band.parent = this.visualRoot;
      band.position = new Vector3(0, 0.95 * UNIT_SCALE, z);
      band.scaling.y = 0.82;
      band.material = bandMaterial;
    }

    // No intermediario que agrupa cabeca, focinho e olhos, para o estado
    // "observando" do comportamento ocioso poder girar so a cabeca (ver
    // getHeadNode()).
    this.headNode = new TransformNode(`${this.id}-head-node`, this.scene);
    this.headNode.parent = this.visualRoot;
    this.headNode.position = new Vector3(0, 0.78 * UNIT_SCALE, 0.82 * UNIT_SCALE);

    const head = MeshBuilder.CreateSphere(
      `${this.id}-head`,
      {
        diameter: 0.62 * UNIT_SCALE,
        segments: 8,
      },
      this.scene
    );
    head.parent = this.headNode;
    head.material = shellMaterial;

    const snout = MeshBuilder.CreateBox(
      `${this.id}-snout`,
      {
        width: 0.22 * UNIT_SCALE,
        height: 0.2 * UNIT_SCALE,
        depth: 0.26 * UNIT_SCALE,
      },
      this.scene
    );
    snout.parent = this.headNode;
    snout.position = new Vector3(0, -0.08 * UNIT_SCALE, 0.28 * UNIT_SCALE);
    snout.material = darkMaterial;

    for (const x of [-0.16 * UNIT_SCALE, 0.16 * UNIT_SCALE]) {
      const eye = MeshBuilder.CreateSphere(
        `${this.id}-eye-${x}`,
        {
          diameter: 0.16 * UNIT_SCALE,
          segments: 8,
        },
        this.scene
      );
      eye.parent = this.headNode;
      eye.position = new Vector3(x, 0.08 * UNIT_SCALE, 0.24 * UNIT_SCALE);
      eye.material = eyeMaterial;

      const pupil = MeshBuilder.CreateSphere(
        `${this.id}-pupil-${x}`,
        {
          diameter: 0.07 * UNIT_SCALE,
          segments: 6,
        },
        this.scene
      );
      pupil.parent = this.headNode;
      pupil.position = new Vector3(x, 0.08 * UNIT_SCALE, 0.31 * UNIT_SCALE);
      pupil.material = pupilMaterial;
    }

    const legOffsets: Array<[number, number]> = [
      [-0.5 * UNIT_SCALE, -0.4 * UNIT_SCALE],
      [0.5 * UNIT_SCALE, -0.4 * UNIT_SCALE],
      [-0.5 * UNIT_SCALE, 0.4 * UNIT_SCALE],
      [0.5 * UNIT_SCALE, 0.4 * UNIT_SCALE],
    ];

    for (const [x, z] of legOffsets) {
      const leg = MeshBuilder.CreateBox(
        `${this.id}-leg-${x}-${z}`,
        {
          width: 0.26 * UNIT_SCALE,
          height: 0.4 * UNIT_SCALE,
          depth: 0.26 * UNIT_SCALE,
        },
        this.scene
      );
      leg.parent = this.visualRoot;
      leg.position = new Vector3(x, 0.24 * UNIT_SCALE, z);
      leg.material = darkMaterial;
    }

    const tail = MeshBuilder.CreateBox(
      `${this.id}-tail`,
      {
        width: 0.16 * UNIT_SCALE,
        height: 0.16 * UNIT_SCALE,
        depth: 0.42 * UNIT_SCALE,
      },
      this.scene
    );
    tail.parent = this.visualRoot;
    tail.position = new Vector3(0, 0.68 * UNIT_SCALE, -0.98 * UNIT_SCALE);
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
