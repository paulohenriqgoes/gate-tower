import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

// Grupo de renderizacao das 3 placas da barra (border/background/fill).
// Desenhar depois do grupo padrao (0) reduz disputa de profundidade contra a
// arena/unidades: as 3 placas ficam quase coplanares, e mesmo em escala de
// sala (1 unidade = 1 metro, Etapa 2) a distancia entre elas em Z e pequena
// o bastante para z-fighting sem este grupo separado.
const HEALTH_BAR_RENDERING_GROUP_ID = 1;

/**
 * Pisos anti-degenerados da barra de vida, em METROS.
 *
 * Eles existem para impedir geometria de dimensao zero quando `height`/`width`
 * chegam muito pequenos — nao para definir o tamanho da barra, que vem sempre
 * do ator que a pediu. Por isso sao fracoes de milimetro: se algum deles virar
 * o valor dominante, a barra ja esta degenerada e o piso so evita o crash.
 *
 * Estao escritos direto em metros de proposito. A Etapa 2 aboliu o fator
 * global de conversao (`1/30`) e reescrever esses numeros como "valor autoral
 * vezes o fator antigo" traria o fator de volta como conceito vivo — a
 * conversao mental que a v3 existe para eliminar.
 */
/** Piso de espessura de detalhe (~0,7 mm). */
const MIN_DETAIL_M = 0.00067;
/** Piso de dimensao visivel de uma placa da barra (~2,7 mm). */
const MIN_BAR_SPAN_M = 0.0027;
/** Passo de separacao em Z entre as placas quase coplanares (~0,33 mm). */
const Z_FIGHT_STEP_M = 0.00033;

/**
 * Sufixo do no raiz de uma barra de vida. Exportado para que quem precisa
 * ligar/desligar TODAS as barras de uma vez (o `GameFlow`, na fase
 * `world-alive`, onde a spec proibe qualquer barra de HP em tela) nao dependa
 * de uma string magica repetida do outro lado do projeto.
 */
export const HEALTH_BAR_ROOT_SUFFIX = "-healthbar-root";

export interface HealthBarMeshOptions {
  backgroundColorHex?: string;
  borderColorHex?: string;
  emissiveIntensity?: number;
  fillColorHex: string;
  height: number;
  id: string;
  parent: Mesh | TransformNode;
  scene: Scene;
  width: number;
  yOffset: number;
  zOffset?: number;
}

export class HealthBarMesh {
  private readonly backgroundMesh;
  private readonly borderMesh;
  private readonly fillMesh;
  private readonly fillWidth: number;
  private readonly root: TransformNode;

  public constructor(options: HealthBarMeshOptions) {
    // Barra "fina demais" era o fill ocupando so metade da altura do fundo,
    // com uma margem lateral generosa (24% da altura de cada lado), quase
    // invisivel em qualquer escala pequena. Fill agora ocupa a maior parte do
    // fundo nos dois eixos — grosso e legivel mesmo minusculo.
    const borderPadding = Math.max(options.height * 0.08, MIN_DETAIL_M);
    const backgroundWidth = Math.max(options.width - borderPadding, options.height);
    const backgroundHeight = Math.max(options.height - borderPadding, options.height * 0.7);
    const fillInsetX = Math.max(options.height * 0.1, MIN_DETAIL_M);
    const fillHeight = Math.max(backgroundHeight * 0.82, MIN_BAR_SPAN_M);

    this.fillWidth = Math.max(backgroundWidth - fillInsetX * 2, MIN_BAR_SPAN_M);

    this.root = new TransformNode(`${options.id}${HEALTH_BAR_ROOT_SUFFIX}`, options.scene);
    this.root.parent = options.parent;
    this.root.position = new Vector3(0, options.yOffset, options.zOffset ?? 0);
    this.root.billboardMode = TransformNode.BILLBOARDMODE_ALL;

    this.borderMesh = MeshBuilder.CreatePlane(
      `${options.id}-healthbar-border`,
      {
        height: options.height,
        width: options.width,
      },
      options.scene
    );
    this.borderMesh.parent = this.root;
    this.borderMesh.isPickable = false;
    // Grupo de renderizacao 1 (depois do padrao 0): evita disputa de
    // profundidade entre as 3 placas empilhadas, quase coplanares.
    this.borderMesh.renderingGroupId = HEALTH_BAR_RENDERING_GROUP_ID;
    this.borderMesh.material = this.createMaterial(
      `${options.id}-healthbar-border-material`,
      options.scene,
      options.borderColorHex ?? options.fillColorHex,
      // Alpha 1 (opaco): 0.95 antes causava a translucidez involuntaria nas
      // torres distantes — StandardMaterial com alpha < 1 entra em modo de
      // blend, que nao "empilha" bem 3 placas quase coplanares e deixa o
      // fundo do mundo vazar por tras da barra.
      1,
      options.emissiveIntensity ?? 0.4
    );

    this.backgroundMesh = MeshBuilder.CreatePlane(
      `${options.id}-healthbar-background`,
      {
        height: backgroundHeight,
        width: backgroundWidth,
      },
      options.scene
    );
    this.backgroundMesh.parent = this.root;
    // Offsets de Z: separam as 3 placas quase coplanares para evitar
    // z-fighting. Sao fracoes de milimetro porque a barra inteira mede
    // centimetros — um gap maior descolaria as placas visivelmente.
    this.backgroundMesh.position.z = -Z_FIGHT_STEP_M;
    this.backgroundMesh.isPickable = false;
    this.backgroundMesh.renderingGroupId = HEALTH_BAR_RENDERING_GROUP_ID;
    this.backgroundMesh.material = this.createMaterial(
      `${options.id}-healthbar-background-material`,
      options.scene,
      options.backgroundColorHex ?? "#020617",
      1,
      0
    );

    this.fillMesh = MeshBuilder.CreatePlane(
      `${options.id}-healthbar-fill`,
      {
        height: fillHeight,
        width: this.fillWidth,
      },
      options.scene
    );
    this.fillMesh.parent = this.root;
    this.fillMesh.position.z = -2 * Z_FIGHT_STEP_M;
    this.fillMesh.position.y = -backgroundHeight * 0.02;
    this.fillMesh.isPickable = false;
    this.fillMesh.renderingGroupId = HEALTH_BAR_RENDERING_GROUP_ID;
    this.fillMesh.material = this.createMaterial(
      `${options.id}-healthbar-fill-material`,
      options.scene,
      options.fillColorHex,
      1,
      options.emissiveIntensity ?? 0.4
    );

    this.setRemainingHealth(1, 1);
    this.setOpacity(1);
  }

  public dispose(): void {
    this.root.dispose(false, true);
  }

  public setOpacity(value: number): void {
    const opacity = Scalar.Clamp(value, 0, 1);
    this.borderMesh.visibility = opacity;
    this.backgroundMesh.visibility = opacity;
    this.fillMesh.visibility = opacity;
  }

  public setRemainingHealth(currentHealth: number, maxHealth: number): void {
    const ratio = maxHealth <= 0 ? 0 : Scalar.Clamp(currentHealth / maxHealth, 0, 1);
    this.fillMesh.isVisible = ratio > 0;

    if (!this.fillMesh.isVisible) {
      return;
    }

    this.fillMesh.scaling.x = ratio;
    // Mantem a borda esquerda fixa enquanto a barra reduz para a direita.
    this.fillMesh.position.x = (this.fillWidth * (ratio - 1)) / 2;
  }

  private createMaterial(
    name: string,
    scene: Scene,
    colorHex: string,
    alpha: number,
    emissiveIntensity: number
  ): StandardMaterial {
    const material = new StandardMaterial(name, scene);
    const color = Color3.FromHexString(colorHex);

    material.diffuseColor = color;
    material.emissiveColor = color.scale(emissiveIntensity);
    material.alpha = alpha;
    material.disableLighting = true;
    material.backFaceCulling = false;

    return material;
  }
}
