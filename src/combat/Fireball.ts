import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

/**
 * O projetil da fireball: uma bola que sai da mao do jogador, voa ate o ponto
 * de impacto e some (JG-12).
 *
 * # Por que existe um voo, em vez de dano instantaneo
 *
 * Hitscan seria mais simples e o resultado numerico, identico. Foi descartado
 * por um motivo de leitura: sem o voo, o jogador nao teria como saber SE
 * acertou — ele veria o cogumelo sumir e um bicho longe piscar, ou nada. O
 * projetil e o unico feedback de que o tiro saiu e para onde foi, e num jogo em
 * que a mira e feita sob pressao isso decide se o jogador aprende a mirar.
 *
 * # Material
 *
 * Emissivo puro, sem `applyMatteFinish`: e a unica coisa do jogo que deve
 * parecer que EMITE luz em vez de recebe-la. Sob a luz de ambiente real, uma
 * bola difusa laranja lê como uma bolinha de plastico laranja; a emissao e o que
 * a faz ler como fogo. Mesma razao pela qual o halo da caverna usa blending
 * aditivo.
 */
export interface FireballOptions {
  /** De onde o tiro sai, em espaco de arena. */
  from: Vector3;
  /** Onde ele explode. Se havia alvo, e a posicao dele. */
  to: Vector3;
  scene: Scene;
  /** Metros por segundo (`FIREBALL_SPEED_MPS`). */
  speedMps: number;
}

/** Raio da bola, em metros. Pequena: ela e um recurso fraco, e tem de parecer. */
const RADIUS_M = 0.06;

export class Fireball {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly direction: Vector3;
  private readonly distanceM: number;
  private readonly speedMps: number;

  private travelledM = 0;
  private isDisposed = false;

  public constructor(options: FireballOptions) {
    const { from, to, scene } = options;

    this.speedMps = options.speedMps;

    const delta = to.subtract(from);
    this.distanceM = delta.length();
    // Tiro de distancia zero (alvo em cima do jogador) nao deve produzir NaN na
    // normalizacao: nesse caso a direcao nao importa, so o descarte imediato.
    this.direction = this.distanceM > 1e-6 ? delta.scale(1 / this.distanceM) : new Vector3(0, 0, 1);

    this.material = new StandardMaterial("fireball-material", scene);
    this.material.emissiveColor = Color3.FromHexString("#EF9F27");
    this.material.diffuseColor = Color3.FromHexString("#7A3E05");
    this.material.specularColor = Color3.Black();
    this.material.disableLighting = true;

    this.mesh = MeshBuilder.CreateSphere("fireball", { diameter: RADIUS_M * 2, segments: 6 }, scene);
    this.mesh.material = this.material;
    this.mesh.position.copyFrom(from);
    this.mesh.isPickable = false;
    this.mesh.doNotSyncBoundingInfo = true;
  }

  public get root(): Mesh {
    return this.mesh;
  }

  /**
   * Avanca o voo. Devolve `true` quando o projetil chegou ao destino — quem
   * chama aplica o dano e chama `dispose()`.
   */
  public update(deltaSeconds: number): boolean {
    if (this.isDisposed) {
      return true;
    }

    this.travelledM += this.speedMps * deltaSeconds;

    if (this.travelledM >= this.distanceM) {
      return true;
    }

    this.mesh.position.addInPlace(this.direction.scale(this.speedMps * deltaSeconds));
    return false;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.mesh.dispose();
    this.material.dispose();
  }
}
