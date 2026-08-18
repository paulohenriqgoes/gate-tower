import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { TROOP_HEIGHT_M } from "../arena/metrics";
import { applyMatteFinish, createMatteMaterial, PALETTE, shadeHex } from "../fx/materials";
import { BaseUnit, type BaseUnitOptions, type UnitVisualState } from "./BaseUnit";

/**
 * Fator unico que multiplica TODAS as medidas lineares da Dona Barata — mesmo
 * espirito do `TOWER_SCALE` de `MushroomTower.ts`. `AUTHORED_HEIGHT` e a
 * extensao em Y da geometria abaixo com fator 1: do fundo da perna (centro
 * 0.5, altura 0.12 -> fundo 0.44) ate o topo do bob mais alto do cabelo
 * (indice 2: no em y = 1.22 + 2*0.03 = 1.28, esfera em y local 0.3, diametro
 * 0.18 -> topo 1.28+0.3+0.09 = 1.67). `1.67 - 0.44` = 1.23. Dividindo
 * `TROOP_HEIGHT_M` (0,35 m) por isso, a Barata passa a medir 0,35 m do pe ao
 * topo dos bobs.
 */
const AUTHORED_HEIGHT = 1.23;
/** Exportado: `UnitFactory` usa o mesmo fator para espacar o esquadrao de 3. */
export const DONA_BARATA_UNIT_SCALE = TROOP_HEIGHT_M / AUTHORED_HEIGHT;
const UNIT_SCALE = DONA_BARATA_UNIT_SCALE;

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
      // funcao do tamanho do campo, ja em metros) em vez de encostar nela —
      // NAO leva `UNIT_SCALE`, e um valor que ja chega correto de fora.
      contactRange: options.attackRange,
      displayName: "Dona Barata",
      health: 35,
      // Velocidade escalada pelo mesmo `UNIT_SCALE` do corpo (regra da
      // Etapa 2 para velocidades de unidade).
      movementSpeed: 1.15 * UNIT_SCALE,
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
        width: 1.2 * UNIT_SCALE,
        height: 0.48 * UNIT_SCALE,
        depth: 1.64 * UNIT_SCALE,
      },
      this.scene
    );
    body.parent = this.visualRoot;
    body.position = new Vector3(0, 0.72 * UNIT_SCALE, -0.1 * UNIT_SCALE);
    body.material = shellMaterial;

    const wingShell = MeshBuilder.CreateBox(
      `${this.id}-wing-shell`,
      {
        width: 1.05 * UNIT_SCALE,
        height: 0.2 * UNIT_SCALE,
        depth: 1.12 * UNIT_SCALE,
      },
      this.scene
    );
    wingShell.parent = this.visualRoot;
    wingShell.position = new Vector3(0, 0.88 * UNIT_SCALE, -0.08 * UNIT_SCALE);
    wingShell.material = wingMaterial;

    const abdomen = MeshBuilder.CreateBox(
      `${this.id}-abdomen`,
      {
        width: 1.06 * UNIT_SCALE,
        height: 0.56 * UNIT_SCALE,
        depth: 0.92 * UNIT_SCALE,
      },
      this.scene
    );
    abdomen.parent = this.visualRoot;
    abdomen.position = new Vector3(0, 0.66 * UNIT_SCALE, -0.88 * UNIT_SCALE);
    abdomen.material = wingMaterial;

    // No intermediario que agrupa cabeca, olhos e antenas, para o estado
    // "observando" do comportamento ocioso poder girar so a cabeca (ver
    // getHeadNode()).
    this.headNode = new TransformNode(`${this.id}-head-node`, this.scene);
    this.headNode.parent = this.visualRoot;
    this.headNode.position = new Vector3(0, 1.02 * UNIT_SCALE, 0.9 * UNIT_SCALE);

    const head = MeshBuilder.CreateBox(
      `${this.id}-head`,
      {
        width: 0.82 * UNIT_SCALE,
        height: 0.42 * UNIT_SCALE,
        depth: 0.62 * UNIT_SCALE,
      },
      this.scene
    );
    head.parent = this.headNode;
    head.material = shellMaterial;

    for (const x of [-0.2 * UNIT_SCALE, 0.2 * UNIT_SCALE]) {
      const eye = MeshBuilder.CreateSphere(
        `${this.id}-eye-${x}`,
        {
          diameter: 0.2 * UNIT_SCALE,
          segments: 8,
        },
        this.scene
      );
      eye.parent = this.headNode;
      // Posicoes originais eram relativas ao visualRoot; reparentadas sob
      // headNode (em (0, 1.02, 0.9)), viram a diferenca entre as duas.
      eye.position = new Vector3(x, 0.08 * UNIT_SCALE, 0.28 * UNIT_SCALE);
      eye.material = eyeMaterial;

      const pupil = MeshBuilder.CreateSphere(
        `${this.id}-pupil-${x}`,
        {
          diameter: 0.08 * UNIT_SCALE,
          segments: 6,
        },
        this.scene
      );
      pupil.parent = this.headNode;
      pupil.position = new Vector3(x, 0.06 * UNIT_SCALE, 0.38 * UNIT_SCALE);
      pupil.material = pupilMaterial;
    }

    const legOffsets = [-0.54, 0, 0.54];
    for (const z of legOffsets) {
      for (const side of [-1, 1]) {
        const leg = MeshBuilder.CreateBox(
          `${this.id}-leg-${side}-${z}`,
          {
            width: 0.66 * UNIT_SCALE,
            height: 0.12 * UNIT_SCALE,
            depth: 0.14 * UNIT_SCALE,
          },
          this.scene
        );
        leg.parent = this.visualRoot;
        leg.position = new Vector3(side * 0.66 * UNIT_SCALE, 0.5 * UNIT_SCALE, z * UNIT_SCALE - 0.02 * UNIT_SCALE);
        leg.rotation.z = side * 0.58;
        // `z` aqui e o INDICE autoral do leque (-0.54/0/0.54), nao a posicao
        // ja escalada — o angulo de leque original fica identico assim.
        leg.rotation.x = z * 0.18;
        leg.material = legMaterial;
      }
    }

    const antennaOffsets = [-0.16 * UNIT_SCALE, 0.16 * UNIT_SCALE];
    for (const x of antennaOffsets) {
      const antenna = MeshBuilder.CreateBox(
        `${this.id}-antenna-${x}`,
        {
          width: 0.04 * UNIT_SCALE,
          height: 0.48 * UNIT_SCALE,
          depth: 0.04 * UNIT_SCALE,
        },
        this.scene
      );
      antenna.parent = this.headNode;
      antenna.position = new Vector3(x, 0.36 * UNIT_SCALE, 0.12 * UNIT_SCALE);
      antenna.rotation.x = -0.38;
      antenna.material = legMaterial;
    }

    bobColors.forEach((_colorHex, index) => {
      const bobNode = new TransformNode(`${this.id}-bob-node-${index}`, this.scene);
      bobNode.parent = this.visualRoot;
      bobNode.position = new Vector3(
        (index - 1) * 0.22 * UNIT_SCALE,
        1.22 * UNIT_SCALE + index * 0.03 * UNIT_SCALE,
        0.98 * UNIT_SCALE - index * 0.06 * UNIT_SCALE
      );

      const stalk = MeshBuilder.CreateBox(
        `${this.id}-bob-stalk-${index}`,
        {
          width: 0.05 * UNIT_SCALE,
          height: 0.26 * UNIT_SCALE,
          depth: 0.05 * UNIT_SCALE,
        },
        this.scene
      );
      stalk.parent = bobNode;
      stalk.position.y = 0.12 * UNIT_SCALE;
      stalk.material = legMaterial;

      const bob = MeshBuilder.CreateSphere(
        `${this.id}-bob-${index}`,
        {
          diameter: 0.18 * UNIT_SCALE,
          segments: 8,
        },
        this.scene
      );
      bob.parent = bobNode;
      bob.position.y = 0.3 * UNIT_SCALE;
      bob.material = bobMaterials[index];

      this.getBobNodes().push(bobNode);
    });

    this.slipperRoot = new TransformNode(`${this.id}-slipper-root`, this.scene);
    this.slipperRoot.parent = this.visualRoot;
    this.slipperRoot.position = new Vector3(0.36 * UNIT_SCALE, 0.92 * UNIT_SCALE, 0.52 * UNIT_SCALE);

    const slipperSole = MeshBuilder.CreateBox(
      `${this.id}-slipper-sole`,
      {
        width: 0.28 * UNIT_SCALE,
        height: 0.08 * UNIT_SCALE,
        depth: 0.74 * UNIT_SCALE,
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

    for (const x of [-0.08 * UNIT_SCALE, 0.08 * UNIT_SCALE]) {
      const strap = MeshBuilder.CreateBox(
        `${this.id}-slipper-strap-${x}`,
        {
          width: 0.06 * UNIT_SCALE,
          height: 0.14 * UNIT_SCALE,
          depth: 0.24 * UNIT_SCALE,
        },
        this.scene
      );
      strap.parent = this.slipperRoot;
      strap.position = new Vector3(x, 0.08 * UNIT_SCALE, 0.08 * UNIT_SCALE);
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
    // 0.03 e amplitude de deslocamento vertical (metros) — escala com
    // `UNIT_SCALE`. 2.2 e frequencia (multiplica tempo), nao espacial.
    const idleWave = state.isMoving ? 0 : Math.sin(this.strideTime * 2.2) * 0.03 * UNIT_SCALE;
    // 0.06 aqui e AMPLITUDE DE ANGULO (`rotation.z` abaixo, radianos) — nao
    // encolhe/cresce com o tamanho do bicho.
    const lateralSway = state.isMoving ? Math.sin(this.strideTime * 4.6) * 0.06 : 0;

    this.visualRoot.position.y = 0.04 * UNIT_SCALE + strideWave * 0.18 * UNIT_SCALE + idleWave;
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
    const arcHeight = Math.sin(progress * Math.PI) * 0.52 * UNIT_SCALE;
    // Teto de seguranca do arremesso: antes comparado direto contra
    // `contactRange` porque os dois viviam na mesma unidade autoral. Hoje
    // `contactRange` (herdado do alcance da torre, ja resolvido em metros
    // pelo `CombatEngine`) e um numero de mundo bem maior que o corpo da
    // Barata, entao o teto escalado por `UNIT_SCALE` PODE passar a limitar o
    // arremesso com mais frequencia do que antes — efeito colateral aceito
    // desta etapa (conversao de escala), nao investigado aqui.
    const throwDistance = Math.min(6.2 * UNIT_SCALE, this.contactRange * 0.78);

    this.slipperRoot.position.x = 0.36 * UNIT_SCALE - progress * 0.18 * UNIT_SCALE;
    this.slipperRoot.position.y = 0.92 * UNIT_SCALE + arcHeight;
    this.slipperRoot.position.z = 0.52 * UNIT_SCALE + progress * throwDistance;
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
