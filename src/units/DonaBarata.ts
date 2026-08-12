import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { applyMatteFinish, createMatteMaterial, PALETTE, shadeHex } from "../fx/materials";
import { BaseUnit, type BaseUnitOptions, type UnitVisualState } from "./BaseUnit";

export interface DonaBarataOptions extends Omit<
  BaseUnitOptions,
  "attackIntervalMs" | "contactRange" | "displayName" | "health" | "movementSpeed"
> {
  attackRange: number;
}

export class DonaBarata extends BaseUnit {
  private bobNodes: TransformNode[] | undefined;

  private slipperRoot!: TransformNode;
  private headNode!: TransformNode;

  private attackAnimationElapsed = Number.POSITIVE_INFINITY;
  private strideTime = 0;

  public constructor(options: DonaBarataOptions) {
    super({
      ...options,
      attackIntervalMs: 1900,
      // Ranged: para no alcance da torre (ja resolvido pelo CombatEngine em
      // funcao do tamanho do campo) em vez de encostar nela.
      contactRange: options.attackRange,
      displayName: "Dona Barata",
      health: 35,
      // 20 unidades entre torres / 1.15 ~= 17 s de travessia — um pouco mais
      // lenta que o javali, como era antes (3.9 contra 4.4).
      movementSpeed: 1.15,
    });
  }

  protected createVisual(): void {
    // Casco em rosa (cor de acento da carta) em vez do marrom-avermelhado
    // original: cor dominante nao pode ser marrom pelo guideline. Asas/abdomen
    // usam a mesma cor mais escura (shadeHex) — o "escuro na base" do
    // guideline.
    const shellMaterial = createMatteMaterial(this.scene, PALETTE.accentBarata, `${this.id}-shell-material`);
    const wingMaterial = createMatteMaterial(
      this.scene,
      shadeHex(PALETTE.accentBarata, 0.55),
      `${this.id}-wing-material`
    );
    const legMaterial = createMatteMaterial(this.scene, PALETTE.neutralDark, `${this.id}-leg-material`);
    const eyeMaterial = createMatteMaterial(this.scene, PALETTE.neutralLight, `${this.id}-eye-material`);
    const pupilMaterial = createMatteMaterial(this.scene, PALETTE.neutralDark, `${this.id}-pupil-material`);

    // Curlers coloridos: efeito deliberado com emissive proprio por bob, por
    // isso NAO passam por createMatteMaterial (que cacheia so pela cor e
    // colidiria com qualquer outro uso da mesma cor) — instancia dedicada +
    // applyMatteFinish para continuar sem brilho especular.
    const bobColors = ["#ff00ff", "#00f5ff", "#fde047"];
    const bobMaterials = bobColors.map((colorHex, index) => {
      const material = new StandardMaterial(`${this.id}-bob-material-${index}`, this.scene);
      material.diffuseColor = Color3.FromHexString(colorHex);
      applyMatteFinish(material);
      material.emissiveColor = Color3.FromHexString(colorHex).scale(0.45);
      return material;
    });

    const body = MeshBuilder.CreateBox(
      `${this.id}-body`,
      {
        width: 1.2,
        height: 0.48,
        depth: 1.64,
      },
      this.scene
    );
    body.parent = this.visualRoot;
    body.position = new Vector3(0, 0.72, -0.1);
    body.material = shellMaterial;

    const wingShell = MeshBuilder.CreateBox(
      `${this.id}-wing-shell`,
      {
        width: 1.05,
        height: 0.2,
        depth: 1.12,
      },
      this.scene
    );
    wingShell.parent = this.visualRoot;
    wingShell.position = new Vector3(0, 0.88, -0.08);
    wingShell.material = wingMaterial;

    const abdomen = MeshBuilder.CreateBox(
      `${this.id}-abdomen`,
      {
        width: 1.06,
        height: 0.56,
        depth: 0.92,
      },
      this.scene
    );
    abdomen.parent = this.visualRoot;
    abdomen.position = new Vector3(0, 0.66, -0.88);
    abdomen.material = wingMaterial;

    // No intermediario que agrupa cabeca, olhos e antenas, para o estado
    // "observando" do comportamento ocioso poder girar so a cabeca (ver
    // getHeadNode()).
    this.headNode = new TransformNode(`${this.id}-head-node`, this.scene);
    this.headNode.parent = this.visualRoot;
    this.headNode.position = new Vector3(0, 1.02, 0.9);

    const head = MeshBuilder.CreateBox(
      `${this.id}-head`,
      {
        width: 0.82,
        height: 0.42,
        depth: 0.62,
      },
      this.scene
    );
    head.parent = this.headNode;
    head.material = shellMaterial;

    for (const x of [-0.2, 0.2]) {
      const eye = MeshBuilder.CreateSphere(
        `${this.id}-eye-${x}`,
        {
          diameter: 0.2,
          segments: 8,
        },
        this.scene
      );
      eye.parent = this.headNode;
      // Posicoes originais eram relativas ao visualRoot; reparentadas sob
      // headNode (em (0, 1.02, 0.9)), viram a diferenca entre as duas.
      eye.position = new Vector3(x, 0.08, 0.28);
      eye.material = eyeMaterial;

      const pupil = MeshBuilder.CreateSphere(
        `${this.id}-pupil-${x}`,
        {
          diameter: 0.08,
          segments: 6,
        },
        this.scene
      );
      pupil.parent = this.headNode;
      pupil.position = new Vector3(x, 0.06, 0.38);
      pupil.material = pupilMaterial;
    }

    const legOffsets = [-0.54, 0, 0.54];
    for (const z of legOffsets) {
      for (const side of [-1, 1]) {
        const leg = MeshBuilder.CreateBox(
          `${this.id}-leg-${side}-${z}`,
          {
            width: 0.66,
            height: 0.12,
            depth: 0.14,
          },
          this.scene
        );
        leg.parent = this.visualRoot;
        leg.position = new Vector3(side * 0.66, 0.5, z - 0.02);
        leg.rotation.z = side * 0.58;
        leg.rotation.x = z * 0.18;
        leg.material = legMaterial;
      }
    }

    const antennaOffsets = [-0.16, 0.16];
    for (const x of antennaOffsets) {
      const antenna = MeshBuilder.CreateBox(
        `${this.id}-antenna-${x}`,
        {
          width: 0.04,
          height: 0.48,
          depth: 0.04,
        },
        this.scene
      );
      antenna.parent = this.headNode;
      antenna.position = new Vector3(x, 0.36, 0.12);
      antenna.rotation.x = -0.38;
      antenna.material = legMaterial;
    }

    bobColors.forEach((_colorHex, index) => {
      const bobNode = new TransformNode(`${this.id}-bob-node-${index}`, this.scene);
      bobNode.parent = this.visualRoot;
      bobNode.position = new Vector3((index - 1) * 0.22, 1.22 + index * 0.03, 0.98 - index * 0.06);

      const stalk = MeshBuilder.CreateBox(
        `${this.id}-bob-stalk-${index}`,
        {
          width: 0.05,
          height: 0.26,
          depth: 0.05,
        },
        this.scene
      );
      stalk.parent = bobNode;
      stalk.position.y = 0.12;
      stalk.material = legMaterial;

      const bob = MeshBuilder.CreateSphere(
        `${this.id}-bob-${index}`,
        {
          diameter: 0.18,
          segments: 8,
        },
        this.scene
      );
      bob.parent = bobNode;
      bob.position.y = 0.3;
      bob.material = bobMaterials[index];

      this.getBobNodes().push(bobNode);
    });

    this.slipperRoot = new TransformNode(`${this.id}-slipper-root`, this.scene);
    this.slipperRoot.parent = this.visualRoot;
    this.slipperRoot.position = new Vector3(0.36, 0.92, 0.52);

    const slipperSole = MeshBuilder.CreateBox(
      `${this.id}-slipper-sole`,
      {
        width: 0.28,
        height: 0.08,
        depth: 0.74,
      },
      this.scene
    );
    slipperSole.parent = this.slipperRoot;
    slipperSole.material = wingMaterial;

    // Mesma logica dos curlers: emissive proprio, entao instancia dedicada em
    // vez de createMatteMaterial (evita colidir no cache com o bob amarelo,
    // que usa a mesma cor base mas outro emissive).
    const strapMaterial = new StandardMaterial(`${this.id}-slipper-strap-material`, this.scene);
    strapMaterial.diffuseColor = Color3.FromHexString("#fde047");
    applyMatteFinish(strapMaterial);
    strapMaterial.emissiveColor = Color3.FromHexString("#f59e0b").scale(0.24);

    for (const x of [-0.08, 0.08]) {
      const strap = MeshBuilder.CreateBox(
        `${this.id}-slipper-strap-${x}`,
        {
          width: 0.06,
          height: 0.14,
          depth: 0.24,
        },
        this.scene
      );
      strap.parent = this.slipperRoot;
      strap.position = new Vector3(x, 0.08, 0.08);
      strap.rotation.x = 0.72;
      strap.material = strapMaterial;
    }

    this.slipperRoot.setEnabled(false);
  }

  public getHeadNode(): TransformNode | null {
    return this.headNode;
  }

  protected computeAttackDamage(): number {
    return 90;
  }

  protected updateVisual(state: UnitVisualState): void {
    this.strideTime += state.deltaSeconds;

    if (state.didAttack) {
      this.attackAnimationElapsed = 0;
      this.slipperRoot.setEnabled(true);
    }

    const strideWave = state.isMoving ? Math.abs(Math.sin(this.strideTime * 6.8)) : 0;
    const idleWave = state.isMoving ? 0 : Math.sin(this.strideTime * 2.2) * 0.03;
    const lateralSway = state.isMoving ? Math.sin(this.strideTime * 4.6) * 0.06 : 0;

    this.visualRoot.position.y = 0.04 + strideWave * 0.18 + idleWave;
    this.visualRoot.rotation.z = lateralSway;
    this.visualRoot.scaling.x = 1 + strideWave * 0.08;
    this.visualRoot.scaling.y = 1 - strideWave * 0.06;
    this.visualRoot.scaling.z = 1 + strideWave * 0.04;

    for (const [index, bobNode] of (this.bobNodes ?? []).entries()) {
      bobNode.rotation.z = Math.sin(this.strideTime * 5.2 + index * 0.9) * 0.24;
      bobNode.rotation.x = Math.cos(this.strideTime * 4.5 + index * 0.6) * 0.12;
    }

    if (!Number.isFinite(this.attackAnimationElapsed)) {
      return;
    }

    this.attackAnimationElapsed += state.deltaSeconds;
    const animationDurationSeconds = 0.42;
    if (this.attackAnimationElapsed >= animationDurationSeconds) {
      this.attackAnimationElapsed = Number.POSITIVE_INFINITY;
      this.slipperRoot.setEnabled(false);
      return;
    }

    const progress = this.attackAnimationElapsed / animationDurationSeconds;
    const arcHeight = Math.sin(progress * Math.PI) * 0.52;
    const throwDistance = Math.min(6.2, this.contactRange * 0.78);

    this.slipperRoot.position.x = 0.36 - progress * 0.18;
    this.slipperRoot.position.y = 0.92 + arcHeight;
    this.slipperRoot.position.z = 0.52 + progress * throwDistance;
    this.slipperRoot.rotation.x = Math.PI * 0.2 + progress * Math.PI * 7;
    this.slipperRoot.rotation.y = progress * Math.PI * 0.8;
  }

  private getBobNodes(): TransformNode[] {
    if (!this.bobNodes) {
      this.bobNodes = [];
    }

    return this.bobNodes;
  }
}
