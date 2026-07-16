import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable } from "@babylonjs/core/Misc/observable";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";

/**
 * O binario do 8th Wall referencia o namespace global BABYLON (padrao UMD).
 * Como o projeto usa ES modules (@babylonjs/core), o global nao existe, entao
 * expomos apenas os simbolos que o modulo Babylonjs do engine consome.
 */
export function installBabylonGlobalsForXR8(): void {
  const globalScope = window as unknown as { BABYLON?: Record<string, unknown> };

  globalScope.BABYLON = {
    Matrix,
    Observable,
    Quaternion,
    Vector3,
    VertexData,
    ...globalScope.BABYLON,
  };
}
