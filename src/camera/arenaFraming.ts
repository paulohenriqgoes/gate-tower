import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Fracao da largura da tela ocupada pela coluna de cartas, na direita. */
export const HUD_RIGHT_FRACTION = 0.22;
/** Folga em volta da arena para ela nao encostar nas bordas. */
export const FRAMING_MARGIN = 1.08;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface ArenaExtents {
  /** Centro da caixa envolvente da arena, em coordenadas de mundo. */
  center: Vector3;
  /** Meias-dimensoes da caixa envolvente, em unidades de mundo. */
  halfExtents: Vec3Like;
}

export interface ArenaCameraRadiusParams {
  /** Angulo horizontal da ArcRotateCamera. */
  alpha: number;
  aspectRatio: number;
  /** Angulo polar da ArcRotateCamera. */
  beta: number;
  halfExtents: Vec3Like;
  hudRightFraction: number;
  margin: number;
  verticalFov: number;
}

export interface CameraBasis {
  forward: Vec3Like;
  right: Vec3Like;
  up: Vec3Like;
}

export const dot = (a: Vec3Like, b: Vec3Like): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Base ortonormal da camera a partir de alpha/beta. A `ArcRotateCamera` fica em
 * `alvo + raio * (cos a sin b, cos b, sin a sin b)`; daqui saem as direcoes que
 * mapeiam o mundo para horizontal/vertical de tela.
 */
export function cameraBasis(alpha: number, beta: number): CameraBasis {
  const forward: Vec3Like = {
    x: -Math.cos(alpha) * Math.sin(beta),
    y: -Math.cos(beta),
    z: -Math.sin(alpha) * Math.sin(beta),
  };

  // right = normalize(cross(worldUp, forward)), com worldUp = (0, 1, 0)
  const rawLength = Math.hypot(forward.z, forward.x);
  const right: Vec3Like =
    rawLength < 1e-6
      ? { x: 1, y: 0, z: 0 }
      : { x: forward.z / rawLength, y: 0, z: -forward.x / rawLength };

  const up: Vec3Like = {
    x: forward.y * right.z - forward.z * right.y,
    y: forward.z * right.x - forward.x * right.z,
    z: forward.x * right.y - forward.y * right.x,
  };

  return { forward, right, up };
}

/**
 * Distancia de camera necessaria para a arena inteira caber na tela.
 *
 * A `ArcRotateCamera` usa FOVMODE_VERTICAL_FIXED: o FOV vertical e constante e o
 * horizontal cresce com o aspect ratio — por isso quanto mais estreita a tela,
 * mais longe a camera precisa ficar. Em vez de aproximar a arena por uma esfera
 * (conservador demais, deixaria o campo pequeno em paisagem), projetamos os 8
 * cantos da caixa envolvente na base da camera e resolvemos o raio minimo que
 * mantem todos dentro do frustum. A faixa da direita ocupada pela coluna de
 * cartas e descontada do FOV horizontal util.
 */
export function computeArenaCameraRadius({
  alpha,
  aspectRatio,
  beta,
  halfExtents,
  hudRightFraction,
  margin,
  verticalFov,
}: ArenaCameraRadiusParams): number {
  const safeAspect = Math.max(aspectRatio, 0.01);
  const safeHudFraction = Math.min(Math.max(hudRightFraction, 0), 0.9);

  const tanVertical = Math.tan(verticalFov / 2);
  // tan(fovH/2) = tan(fovV/2) * aspect; a faixa do HUD encolhe a metade util.
  const tanHorizontal = tanVertical * safeAspect * (1 - safeHudFraction);

  const { forward, right, up } = cameraBasis(alpha, beta);

  let required = 0;

  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const corner: Vec3Like = {
          x: signX * halfExtents.x,
          y: signY * halfExtents.y,
          z: signZ * halfExtents.z,
        };

        // Profundidade do canto em relacao ao alvo: cantos atras do alvo
        // (depth negativa) exigem mais distancia.
        const depth = dot(corner, forward);
        const horizontal = Math.abs(dot(corner, right)) / tanHorizontal - depth;
        const vertical = Math.abs(dot(corner, up)) / tanVertical - depth;

        required = Math.max(required, horizontal, vertical);
      }
    }
  }

  // Piso de seguranca: a camera nunca pode ficar dentro da propria arena.
  const boundingRadius = Math.hypot(halfExtents.x, halfExtents.y, halfExtents.z);

  return Math.max(required * margin, boundingRadius);
}

/**
 * Deslocamento lateral, em unidades de mundo na distancia do alvo, que recentra
 * a arena no espaco livre a esquerda da coluna de cartas.
 */
export function computeHudScreenOffset(
  radius: number,
  verticalFov: number,
  aspectRatio: number,
  hudRightFraction: number = HUD_RIGHT_FRACTION
): number {
  const tanHorizontal = Math.tan(verticalFov / 2) * Math.max(aspectRatio, 0.01);

  return radius * tanHorizontal * hudRightFraction;
}

/**
 * Le a caixa envolvente da arena a partir da propria hierarquia de malhas.
 * Deve ser chamado ANTES do modo RA reescalar o root (escala absoluta ~0.02).
 */
export function measureArenaExtents(arenaRoot: TransformNode): ArenaExtents {
  const { max, min } = arenaRoot.getHierarchyBoundingVectors(true);
  const size = max.subtract(min);

  return {
    center: min.add(max).scale(0.5),
    halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 },
  };
}

/**
 * Reposiciona a camera para enquadrar a arena na orientacao/tamanho atuais.
 * Deve ser chamado na criacao da cena e a cada `resize`/`orientationchange`.
 */
export function frameArenaCamera(
  camera: ArcRotateCamera,
  engine: Engine,
  extents: ArenaExtents
): void {
  const aspectRatio = engine.getAspectRatio(camera);
  const radius = computeArenaCameraRadius({
    alpha: camera.alpha,
    aspectRatio,
    beta: camera.beta,
    halfExtents: extents.halfExtents,
    hudRightFraction: HUD_RIGHT_FRACTION,
    margin: FRAMING_MARGIN,
    verticalFov: camera.fov,
  });

  camera.setTarget(extents.center.clone());
  // Limites derivados do enquadramento: os valores fixos anteriores (24/55)
  // travavam o resultado do calculo em telas largas.
  camera.lowerRadiusLimit = radius * 0.6;
  camera.upperRadiusLimit = radius * 1.8;
  camera.radius = radius;

  // Empurra a cena para a esquerda em espaco de tela, liberando a faixa das
  // cartas sem mexer no alvo real da camera. O offset entra direto na translacao
  // da view matrix (unidades de mundo na distancia do alvo) e x positivo joga a
  // cena para a direita — por isso o sinal negativo.
  camera.targetScreenOffset.x = -computeHudScreenOffset(radius, camera.fov, aspectRatio);
  camera.targetScreenOffset.y = 0;
}
