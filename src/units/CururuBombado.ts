import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { TROOP_HEIGHT_M } from "../arena/metrics";
import { applyMatteFinish, createMatteMaterial, PALETTE, shadeHex } from "../fx/materials";
import { BaseUnit, type BaseUnitOptions, type UnitVisualState } from "./BaseUnit";

/**
 * Fator unico que multiplica TODAS as medidas lineares do Cururu Bombado —
 * mesmo espirito do `TOWER_SCALE` de `MushroomTower.ts`. `AUTHORED_HEIGHT` e
 * a extensao em Y da geometria abaixo com fator 1: do fundo da perna (centro
 * 0.38, altura 0.66 -> fundo 0.05) ate o topo do soquete do olho (centro
 * 2.64, altura 0.54 -> topo 2.91). `2.91 - 0.05` = 2.86. Dividindo
 * `TROOP_HEIGHT_M` (0,35 m) por isso, o Cururu passa a medir 0,35 m do pe ao
 * ponto mais alto (o soquete do olho, que ultrapassa um pouco o topo da
 * cabeca de proposito — bicho de olho saltado).
 */
const AUTHORED_HEIGHT = 2.86;
const UNIT_SCALE = TROOP_HEIGHT_M / AUTHORED_HEIGHT;

export interface CururuBombadoOptions extends Omit<
  BaseUnitOptions,
  "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"
> {
  towerMaxHealth: number;
}

export class CururuBombado extends BaseUnit {
  // Posicoes da lingua relativas ao headNode (antes eram relativas ao
  // visualRoot; ver createVisual).
  private readonly tongueBaseY = -0.2 * UNIT_SCALE;
  private readonly tongueBaseZ = 0.8 * UNIT_SCALE;
  private tongueMesh!: Mesh;
  private headNode!: TransformNode;

  private attackAnimationElapsed = Number.POSITIVE_INFINITY;
  private hopTime = 0;

  public constructor(options: CururuBombadoOptions) {
    super({
      ...options,
      attackIntervalMs: 1500,
      attackIntervalRangeMs: {
        max: 2000,
        min: 1000,
      },
      // Corpo-a-corpo de um bicho grande: depende do tamanho dele (mesmo
      // fator `UNIT_SCALE` do resto do arquivo), nao do tamanho do campo.
      contactRange: 2.55 * UNIT_SCALE,
      displayName: "Cururu Bombado",
      health: Math.round(options.towerMaxHealth * 0.6),
      // Tanque: o mais lento dos tres. Velocidade escalada pelo mesmo
      // `UNIT_SCALE` do corpo (regra da Etapa 2 para velocidades de unidade) —
      // o tempo de travessia real do campo muda com isso; recalibrar o ritmo
      // de partida fica para uma etapa de balanceamento, nao esta.
      movementSpeed: 0.85 * UNIT_SCALE,
    });
  }

  protected createVisual(): void {
    // Pele ja era azul-ciano (nao marrom/bege), entao vira acento da paleta
    // sem trocar de familia de cor. Sombra/barriga derivadas dela via
    // shadeHex: escuro nos ombros/bracos/pernas (base), claro na barriga
    // (topo) — o "escuro na base, claro no topo" do guideline.
    const skinMaterial = createMatteMaterial(this.scene, PALETTE.accentCururu, `${this.id}-skin-material`);
    const shadowSkinMaterial = createMatteMaterial(
      this.scene,
      shadeHex(PALETTE.accentCururu, 0.55),
      `${this.id}-shadow-skin-material`
    );
    const bellyMaterial = createMatteMaterial(
      this.scene,
      shadeHex(PALETTE.accentCururu, 1.5),
      `${this.id}-belly-material`
    );
    const eyeMaterial = createMatteMaterial(this.scene, PALETTE.neutralLight, `${this.id}-eye-material`);
    const pupilMaterial = createMatteMaterial(this.scene, PALETTE.neutralDark, `${this.id}-pupil-material`);

    // Lingua: emissive proprio (efeito deliberado do golpe), entao instancia
    // dedicada em vez de createMatteMaterial — ver nota equivalente em
    // DonaBarata.ts.
    const tongueMaterial = new StandardMaterial(`${this.id}-tongue-material`, this.scene);
    tongueMaterial.diffuseColor = Color3.FromHexString("#f472b6");
    applyMatteFinish(tongueMaterial);
    tongueMaterial.emissiveColor = Color3.FromHexString("#ec4899").scale(0.25);

    const body = MeshBuilder.CreateBox(
      `${this.id}-body`,
      {
        width: 2.15 * UNIT_SCALE,
        height: 1.35 * UNIT_SCALE,
        depth: 2.35 * UNIT_SCALE,
      },
      this.scene
    );
    body.parent = this.visualRoot;
    body.position = new Vector3(0, 1.1 * UNIT_SCALE, 0.2 * UNIT_SCALE);
    body.material = skinMaterial;

    const shoulders = MeshBuilder.CreateBox(
      `${this.id}-shoulders`,
      {
        width: 2.45 * UNIT_SCALE,
        height: 0.62 * UNIT_SCALE,
        depth: 1.15 * UNIT_SCALE,
      },
      this.scene
    );
    shoulders.parent = this.visualRoot;
    shoulders.position = new Vector3(0, 1.7 * UNIT_SCALE, 0);
    shoulders.material = shadowSkinMaterial;

    const belly = MeshBuilder.CreateBox(
      `${this.id}-belly`,
      {
        width: 1.28 * UNIT_SCALE,
        height: 0.84 * UNIT_SCALE,
        depth: 1.35 * UNIT_SCALE,
      },
      this.scene
    );
    belly.parent = this.visualRoot;
    belly.position = new Vector3(0, 0.94 * UNIT_SCALE, 0.74 * UNIT_SCALE);
    belly.material = bellyMaterial;

    // No intermediario que agrupa cabeca, queixo, olhos e lingua, para o
    // estado "observando" do comportamento ocioso poder girar so a cabeca
    // (ver getHeadNode()).
    this.headNode = new TransformNode(`${this.id}-head-node`, this.scene);
    this.headNode.parent = this.visualRoot;
    this.headNode.position = new Vector3(0, 2.06 * UNIT_SCALE, 1.06 * UNIT_SCALE);

    const head = MeshBuilder.CreateBox(
      `${this.id}-head`,
      {
        width: 1.9 * UNIT_SCALE,
        height: 1.02 * UNIT_SCALE,
        depth: 1.48 * UNIT_SCALE,
      },
      this.scene
    );
    head.parent = this.headNode;
    head.material = skinMaterial;

    const jaw = MeshBuilder.CreateBox(
      `${this.id}-jaw`,
      {
        width: 1.72 * UNIT_SCALE,
        height: 0.34 * UNIT_SCALE,
        depth: 1.1 * UNIT_SCALE,
      },
      this.scene
    );
    jaw.parent = this.headNode;
    // Posicoes originais eram relativas ao visualRoot; reparentadas sob
    // headNode (em (0, 2.06, 1.06)), viram a diferenca entre as duas.
    jaw.position = new Vector3(0, -0.43 * UNIT_SCALE, 0.3 * UNIT_SCALE);
    jaw.material = shadowSkinMaterial;

    for (const x of [-0.52 * UNIT_SCALE, 0.52 * UNIT_SCALE]) {
      const eyeSocket = MeshBuilder.CreateBox(
        `${this.id}-eye-socket-${x}`,
        {
          width: 0.54 * UNIT_SCALE,
          height: 0.54 * UNIT_SCALE,
          depth: 0.54 * UNIT_SCALE,
        },
        this.scene
      );
      eyeSocket.parent = this.headNode;
      eyeSocket.position = new Vector3(x, 0.58 * UNIT_SCALE, 0.2 * UNIT_SCALE);
      eyeSocket.material = eyeMaterial;

      const pupil = MeshBuilder.CreateBox(
        `${this.id}-pupil-${x}`,
        {
          width: 0.16 * UNIT_SCALE,
          height: 0.16 * UNIT_SCALE,
          depth: 0.16 * UNIT_SCALE,
        },
        this.scene
      );
      pupil.parent = this.headNode;
      pupil.position = new Vector3(x, 0.49 * UNIT_SCALE, 0.5 * UNIT_SCALE);
      pupil.material = pupilMaterial;
    }

    const armDefinitions: Array<[number, number]> = [
      [-1.2 * UNIT_SCALE, 0.36 * UNIT_SCALE],
      [1.2 * UNIT_SCALE, 0.36 * UNIT_SCALE],
    ];

    for (const [x, z] of armDefinitions) {
      const upperArm = MeshBuilder.CreateBox(
        `${this.id}-upper-arm-${x}`,
        {
          width: 0.48 * UNIT_SCALE,
          height: 0.88 * UNIT_SCALE,
          depth: 0.58 * UNIT_SCALE,
        },
        this.scene
      );
      upperArm.parent = this.visualRoot;
      upperArm.position = new Vector3(x, 1.12 * UNIT_SCALE, z);
      upperArm.material = shadowSkinMaterial;

      const fist = MeshBuilder.CreateBox(
        `${this.id}-fist-${x}`,
        {
          width: 0.52 * UNIT_SCALE,
          height: 0.34 * UNIT_SCALE,
          depth: 0.52 * UNIT_SCALE,
        },
        this.scene
      );
      fist.parent = this.visualRoot;
      fist.position = new Vector3(x, 0.48 * UNIT_SCALE, z + 0.26 * UNIT_SCALE);
      fist.material = skinMaterial;
    }

    const legDefinitions: Array<[number, number]> = [
      [-0.74 * UNIT_SCALE, -0.52 * UNIT_SCALE],
      [0.74 * UNIT_SCALE, -0.52 * UNIT_SCALE],
      [-0.78 * UNIT_SCALE, 0.96 * UNIT_SCALE],
      [0.78 * UNIT_SCALE, 0.96 * UNIT_SCALE],
    ];

    for (const [x, z] of legDefinitions) {
      const leg = MeshBuilder.CreateBox(
        `${this.id}-leg-${x}-${z}`,
        {
          width: 0.58 * UNIT_SCALE,
          height: 0.66 * UNIT_SCALE,
          depth: 0.64 * UNIT_SCALE,
        },
        this.scene
      );
      leg.parent = this.visualRoot;
      leg.position = new Vector3(x, 0.38 * UNIT_SCALE, z);
      leg.material = shadowSkinMaterial;
    }

    const backPlate = MeshBuilder.CreateBox(
      `${this.id}-back-plate`,
      {
        width: 1.5 * UNIT_SCALE,
        height: 0.34 * UNIT_SCALE,
        depth: 0.92 * UNIT_SCALE,
      },
      this.scene
    );
    backPlate.parent = this.visualRoot;
    backPlate.position = new Vector3(0, 2.02 * UNIT_SCALE, -0.52 * UNIT_SCALE);
    backPlate.material = bellyMaterial;

    this.tongueMesh = MeshBuilder.CreateBox(
      `${this.id}-tongue`,
      {
        width: 0.24 * UNIT_SCALE,
        height: 0.16 * UNIT_SCALE,
        depth: 0.28 * UNIT_SCALE,
      },
      this.scene
    );
    this.tongueMesh.parent = this.headNode;
    this.tongueMesh.position = new Vector3(0, this.tongueBaseY, this.tongueBaseZ);
    this.tongueMesh.material = tongueMaterial;
    this.tongueMesh.scaling.z = 0.25;
  }

  public getHeadNode(): TransformNode | null {
    return this.headNode;
  }

  protected computeAttackDamage(): number {
    const missingHealthRatio = 1 - this.getHealthRatio();
    return 100 + Math.round(missingHealthRatio * 60);
  }

  protected updateVisual(state: UnitVisualState): void {
    this.hopTime += state.deltaSeconds;

    if (state.didAttack) {
      this.attackAnimationElapsed = 0;
    }

    const hopWave = state.isMoving ? Math.abs(Math.sin(this.hopTime * 4.2)) : 0;
    // 0.22 e 0.03 sao amplitudes de deslocamento vertical (metros) — escalam
    // com `UNIT_SCALE`. 4.2 e 1.4 sao frequencias (multiplicam tempo), nao
    // espaciais.
    const baseBob = state.isMoving ? hopWave * 0.22 * UNIT_SCALE : Math.sin(this.hopTime * 1.4) * 0.03 * UNIT_SCALE;
    const squashFactor = state.isMoving ? hopWave * 0.08 : 0;

    this.visualRoot.position.y = baseBob;
    this.visualRoot.scaling.x = 1 + squashFactor * 0.55;
    this.visualRoot.scaling.y = 1 - squashFactor * 0.65;
    this.visualRoot.scaling.z = 1 + squashFactor * 0.45;

    if (Number.isFinite(this.attackAnimationElapsed)) {
      this.attackAnimationElapsed += state.deltaSeconds;
      if (this.attackAnimationElapsed > 0.34) {
        this.attackAnimationElapsed = Number.POSITIVE_INFINITY;
      }
    }

    const attackProgress = Number.isFinite(this.attackAnimationElapsed)
      ? Math.min(1, this.attackAnimationElapsed / 0.34)
      : 1;
    const tonguePulse = Number.isFinite(this.attackAnimationElapsed)
      ? Math.sin(attackProgress * Math.PI)
      : 0;

    // 6.2/0.25 escalam o mesh (`scaling`, adimensional); 0.04/0.88 sao
    // deslocamentos em metros da propria lingua, entao escalam com `UNIT_SCALE`.
    this.tongueMesh.scaling.z = 0.25 + tonguePulse * 6.2;
    this.tongueMesh.position.y = this.tongueBaseY + tonguePulse * 0.04 * UNIT_SCALE;
    this.tongueMesh.position.z = this.tongueBaseZ + tonguePulse * 0.88 * UNIT_SCALE;
  }
}
