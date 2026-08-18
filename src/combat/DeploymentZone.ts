import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { applyMatteFinish, PALETTE } from "../fx/materials";

/**
 * Subconjunto do `ArenaLayout` (ver `ArenaSystem.ts`) que a zona precisa.
 * Duplicado de proposito em vez de importado: o `CombatEngine` ja duplica o
 * mesmo formato como `CombatArenaLayout` por este motivo (ver comentario la),
 * e aqui vale a mesma logica — quem monta a cena so precisa passar um objeto
 * com este formato, sem acoplar `combat/` a `arena/`.
 */
export interface DeploymentZoneArenaLayout {
  maxX: number;
  minX: number;
  minZ: number;
  /** Metade do jogador: a zona cobre z em [minZ, playerDeploymentMaxZ]. */
  playerDeploymentMaxZ: number;
}

export interface DeploymentZoneOptions {
  arenaLayout: DeploymentZoneArenaLayout;
  arenaRoot: TransformNode;
  scene: Scene;
}

// Offset em Y do overlay, em metros (Etapa 2: 1 unidade do Babylon = 1 metro,
// `src/arena/metrics.ts`). Precisa ficar acima de TRES coisas coplanares: o
// `arena-ground` invisivel (y=0, nunca renderiza - visibility=0 - entao nao
// ha artefato visual ali, mas fica registrado por completude), as sombras de
// contato das torres (y proximo de 0, ver `ArenaSystem.addContactBlob`) e
// principalmente o TOPO dos tiles do grid xadrez (ver `ArenaSystem.ts`,
// `ARENA_DETAIL_SCALE`), que so ficam visiveis no modo tela/canvas (em RA o
// grid e escondido por `setArenaGridVisible(false)`). Sem limpar o topo do
// tile, a zona ficaria encoberta pelos tiles opacos sempre que o jogo roda
// fora de RA.
//
// Valor escalado pelo MESMO fator de detalhe do `ArenaSystem` (0.55/2 =
// 0.275, ja que este offset tambem e um detalhe de "acima do chao/tile" e
// nao um ator com alvo proprio em `metrics.ts`): 0.22 * 0.275 ~= 0,0605 m —
// folga suficiente para nao dar z-fighting com nenhuma das tres superficies
// acima, e ainda bem abaixo dos pes das unidades (`unitGroundY`).
const ZONE_Y_OFFSET = 0.22 * (0.55 / 2);

// Alpha do overlay aceso: baixo o bastante para nao esconder o chao/feed de
// camera por baixo, alto o bastante para ler contra qualquer fundo (a spec
// pede legibilidade "por cima do feed de camera da RA", que pode ser
// qualquer coisa — mesa de madeira, tapete, ceramica clara).
const ZONE_ALPHA = 0.32;

/**
 * Overlay que acende a metade do jogador da arena (z <= playerDeploymentMaxZ)
 * quando uma carta esta selecionada, marcando a zona valida de invocacao.
 *
 * Filho do `arenaRoot`: acompanha posicao/rotacao/escala da ancoragem em RA
 * sem calculo extra. `isInside` e a UNICA fonte de verdade sobre "esse ponto
 * local esta dentro da zona valida" — o `CombatEngine` consulta este metodo
 * em vez de repetir as comparacoes de limite.
 *
 * O mesh nasce e permanece SEMPRE `isPickable = false`: a zona e um overlay
 * puramente visual, nunca um alvo de picking. O toque no mundo sempre pega o
 * `arena-ground` por baixo (ou nada); o `CombatEngine` decide dentro/fora
 * chamando `isInside` com o ponto ja convertido para o espaco local da arena.
 * Isso cobre com folga o requisito de "apagado: invisivel e nao pickavel" —
 * como nunca e pickavel, o estado aceso tambem nao interfere no picking do
 * chao.
 */
export class DeploymentZone {
  private readonly arenaLayout: DeploymentZoneArenaLayout;
  private readonly material: StandardMaterial;
  private readonly mesh: Mesh;

  public constructor(options: DeploymentZoneOptions) {
    this.arenaLayout = options.arenaLayout;

    const width = options.arenaLayout.maxX - options.arenaLayout.minX;
    const depth = options.arenaLayout.playerDeploymentMaxZ - options.arenaLayout.minZ;

    this.mesh = MeshBuilder.CreateGround(
      "deployment-zone",
      { width, height: depth },
      options.scene
    );
    this.mesh.parent = options.arenaRoot;
    this.mesh.position.set(
      (options.arenaLayout.minX + options.arenaLayout.maxX) / 2,
      ZONE_Y_OFFSET,
      (options.arenaLayout.minZ + options.arenaLayout.playerDeploymentMaxZ) / 2
    );
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = false;
    this.mesh.isVisible = false;

    // Material proprio (nao passa por `createMatteMaterial`): aquele cache e
    // por cor+cena e serve para materiais "planos", e este aqui precisa de
    // emissive + alpha customizados que NAO podem contaminar nenhum material
    // compartilhado.
    this.material = new StandardMaterial("deployment-zone-material", options.scene);
    this.material.disableLighting = true;
    this.material.diffuseColor = Color3.Black();
    this.material.emissiveColor = Color3.FromHexString(PALETTE.towerPlayer);
    this.material.alpha = ZONE_ALPHA;
    this.material.backFaceCulling = false;
    applyMatteFinish(this.material);

    this.mesh.material = this.material;
  }

  /** Acende (mostra a zona valida) ou apaga (some) o overlay. */
  public setHighlighted(isHighlighted: boolean): void {
    this.mesh.isVisible = isHighlighted;
  }

  /**
   * `localPoint` ja deve estar no espaco local do `arenaRoot` (ver
   * `CombatEngine.convertWorldToArenaLocal`). Unica fonte de verdade da zona
   * valida de invocacao do jogador.
   */
  public isInside(localPoint: Vector3): boolean {
    if (localPoint.x < this.arenaLayout.minX || localPoint.x > this.arenaLayout.maxX) {
      return false;
    }

    if (localPoint.z < this.arenaLayout.minZ || localPoint.z > this.arenaLayout.playerDeploymentMaxZ) {
      return false;
    }

    return true;
  }

  public dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
  }
}
