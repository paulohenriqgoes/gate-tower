import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

export interface ContactShadowOptions {
  /** Diametro do disco de sombra, em unidades locais. Default 1.6. */
  diameter?: number;
  /** Opacidade no centro do gradiente (0..1). Default 0.45. */
  opacity?: number;
  /** Nome base do mesh/material/textura. Default "contact-shadow". */
  name?: string;
}

/**
 * Cria um "blob" de sombra de contato: um disco horizontal (no plano XZ, y local
 * = 0) com um gradiente radial transparente — escuro no centro, transparente na
 * borda — que ancora visualmente uma entidade no chao (sensacao de estar no piso,
 * sem depender de shadow-mapping).
 *
 * Requisitos da implementacao:
 * - Geometria: um ground/plano circular voltado para cima (usar `MeshBuilder`),
 *   com `y` local = 0. Parentear/posicionar fica a cargo de quem chama.
 * - Material UNLIT e transparente: usar `StandardMaterial` com `disableLighting =
 *   true`, `emissiveColor` preto, e a textura de gradiente radial no
 *   `opacityTexture` (ou `diffuseTexture` + alpha) via `DynamicTexture` desenhando
 *   um `createRadialGradient` (centro alpha=`opacity` → borda alpha=0).
 * - `mesh.isPickable = false`, nao projeta nem recebe sombra, e nao deve ocluir
 *   (transparente). `backFaceCulling` desligado para ser visto de cima.
 *
 * @returns o mesh do blob (posicionado na origem local; cabe a quem chama posicionar).
 */
export function createContactShadow(scene: Scene, options?: ContactShadowOptions): Mesh {
  const diameter = options?.diameter ?? 1.6;
  const opacity = options?.opacity ?? 0.45;
  const name = options?.name ?? "contact-shadow";

  const mesh = MeshBuilder.CreateGround(
    name,
    {
      height: diameter,
      width: diameter,
    },
    scene
  );
  mesh.isPickable = false;
  mesh.receiveShadows = false;

  const textureSize = 256;
  const texture = new DynamicTexture(`${name}-texture`, { width: textureSize, height: textureSize }, scene, true);
  texture.hasAlpha = true;

  const context = texture.getContext();
  const center = textureSize / 2;

  context.clearRect(0, 0, textureSize, textureSize);

  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, textureSize, textureSize);

  texture.update();

  const material = new StandardMaterial(`${name}-material`, scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.opacityTexture = texture;
  material.backFaceCulling = false;
  material.needDepthPrePass = false;

  mesh.material = material;

  return mesh;
}
