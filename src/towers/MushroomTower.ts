import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Constants } from "@babylonjs/core/Engines/constants";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId, TowerLaneId } from "../battle/BattleTypes";
import { TOWER_HEIGHT_M } from "../arena/metrics";
import { applyMatteFinish, createMatteMaterial, PALETTE } from "../fx/materials";

/**
 * Etapa 2 do mundo vivo: as torres deixam de ser cilindros e viram cogumelos.
 * Referencia de direcao de arte: Alice no Pais das Maravilhas / a toca do
 * coelho do Crash Bandicoot — a torre inimiga precisa ler como "tem alguma
 * coisa morando ai dentro" so pela silhueta e pela cor, antes de qualquer
 * animacao (etapas futuras cuidam da placa "CUIDADO" e do coelho que pula).
 *
 * Contagem de meshes / draw calls por torre (cada mesh sem instancing conta
 * como 1 draw call — volume baixo demais pra thin instance justificar aqui):
 * - `body` (caule + chapeu): SEMPRE 1 mesh. `Mesh.MergeMeshes` solda as duas
 *   geometrias numa so ANTES de qualquer coisa ser parenteada — resolve dois
 *   problemas de uma vez: (a) mantem 1 draw call em vez de 2 e (b) a bounding
 *   box PROPRIA do mesh (nao a hierarquica) passa a cobrir caule+chapeu, que
 *   e o que `TowerActor.resolveHealthBarOffsetY` usa pra posicionar a barra
 *   de vida — se o chapeu fosse um filho separado, a barra ficaria na altura
 *   do caule, enterrada dentro do chapeu.
 * - boca da caverna: 3 meshes SEMPRE (nas duas torres) — a boca escura, o
 *   nucleo do brilho e o halo aditivo, ver `createCaveMouth`. Na torre do
 *   jogador elas existem mas ficam apagadas (glow = 0): "e o mesmo cogumelo,
 *   com a caverna apagada".
 * - olhos: 1 mesh (par soldado numa unica geometria), so na torre inimiga.
 *   `eyes` fica `null` na torre do jogador — nao ha mesh nenhuma pra criar.
 *
 * Total por torre: jogador = 1 + 3 = 4. Inimiga = 1 + 3 + 1 = 5. Soma das
 * duas = 9. A implementacao anterior (um cilindro cada) somava 2. O halo
 * estourou o orcamento original de +6 desta etapa em 1 draw call, e o motivo
 * esta em `HALO_DIAMETER_FACTOR`: sem ele a caverna nao chamava atencao
 * nenhuma em device, e uma caverna que nao chama nao tem por que existir.
 */

/**
 * Fator unico que multiplica TODAS as medidas lineares do cogumelo.
 *
 * Ate a Etapa 1 este numero (1.7) era escolhido a olho contra outra unidade
 * autoral, e a torre inteira ficava escalada mais uma vez pelo fator unico do
 * `ArenaSystem` (extinto nesta etapa, ~0,0333) para virar tamanho fisico. A v3
 * tem 1 unidade =
 * 1 metro (`src/arena/metrics.ts`) em vez disso, entao o fator agora e
 * DERIVADO do alvo real da torre: `TOWER_HEIGHT_M` (1,20 m) dividido pela
 * altura que a geometria abaixo produz num fator de 1 (`AUTHORED_TOWER_HEIGHT`
 * = `STEM_HEIGHT` + o degrau do centro do chapeu + a metade do chapeu, todos
 * SEM o fator, isto e, `1.9 + 0.05 + 1.5/2` = 2,7 — o mesmo "2,7 unidades de
 * altura" medido em device em 2026-08-14, ver historico deste comentario).
 * Trocar `TOWER_HEIGHT_M` em `metrics.ts` reescala a torre inteira; nenhum
 * numero aqui embaixo precisa mudar.
 *
 * O segundo motivo do fator unico e de seguranca. As protuberancias da caverna
 * e dos olhos sao calculadas contra o RAIO DO CAULE naquela altura: mexer numa
 * medida sem mexer nas outras enterra a caverna dentro do caule opaco e ela
 * simplesmente desaparece (erro que ja aconteceu uma vez na construcao deste
 * arquivo). Escalando tudo pelo mesmo fator, essas relacoes ficam preservadas
 * por construcao — nao ha o que recalcular.
 *
 * Limite superior: o cogumelo nao pode passar da borda da arena (provisoria,
 * Etapa 3 troca por arco polar). O chapeu tem raio `CAP_DIAMETER_XZ / 2` e a
 * torre fica em z = ±2,0 m — com `TOWER_HEIGHT_M` = 1,20 m o chapeu vai ate
 * z ≈ 2,53 m, alem da borda provisoria de ±2,2 m. E esperado nesta etapa (a
 * arena retangular e descartavel); o arco da Etapa 3 resolve isso de verdade.
 */
const AUTHORED_TOWER_HEIGHT = 1.9 + 0.05 + 1.5 / 2; // 2.7 — ver docblock acima.
/**
 * Exportado: `TowerActor` (barra de vida) e `CautionSign` (placa encostada na
 * torre) precisam de paddings proporcionais ao tamanho REAL da torre, e devem
 * derivar do mesmo fator em vez de repetir a conta.
 */
export const TOWER_SCALE = TOWER_HEIGHT_M / AUTHORED_TOWER_HEIGHT;

// Caule: leve afunilamento pro topo (mais grosso na base), tessellation baixa
// porque e uma forma simples vista de longe numa mesa — nao precisa dos 24
// lados do cilindro antigo.
const STEM_HEIGHT = 1.9 * TOWER_SCALE;
const STEM_DIAMETER_TOP = 0.95 * TOWER_SCALE;
/** Exportado: `CautionSign` usa o raio da base para nao cravar a placa dentro do caule. */
export const STEM_DIAMETER_BOTTOM = 1.3 * TOWER_SCALE;
const STEM_TESSELLATION = 14;

// Chapeu: metade de cima de uma esfera achatada (`slice` corta a esfera pela
// altura, mantendo o polo de cima — ver CreateSphereVertexData). `slice` >
// 0.5 deixa a aba descer um pouco alem do equador, que e a curva caracteristica
// de um chapeu de cogumelo (nao um hemisferio perfeito).
/** Diametro real do chapeu, em metros. Exportado: `ArenaSystem` deriva o blob de contato e o diametro nominal da torre dele; `CautionSign` deriva o raio a evitar. */
export const CAP_DIAMETER_XZ = 2.4 * TOWER_SCALE;
const CAP_DIAMETER_Y = 1.5 * TOWER_SCALE;
const CAP_SLICE = 0.6;
const CAP_SEGMENTS = 12;
// Centro do chapeu um pouco acima do topo do caule: a aba (que desce alem do
// equador por causa do slice > 0.5) fica alguns centimetros autorais dentro
// do caule, escondendo a costura das duas geometrias antes da solda.
const CAP_CENTER_Y = STEM_HEIGHT + 0.05 * TOWER_SCALE;

// Boca da caverna: uma reentrancia falsa (sem CSG de verdade — o projeto nao
// usa booleana em nenhum outro lugar) feita por contraste de cor, no mesmo
// espirito das pupilas do Tatu Bola (esfera escura sobre a esfera clara, nao
// um buraco de verdade). Fica na altura do meio do caule, virada pro centro
// da arena (ver `resolveFacingSignZ`).
const CAVE_MOUTH_DIAMETER_X = 0.85 * TOWER_SCALE;
const CAVE_MOUTH_DIAMETER_Y = 1.05 * TOWER_SCALE;
const CAVE_MOUTH_DIAMETER_Z = 0.5 * TOWER_SCALE;
const CAVE_MOUTH_Y = STEM_HEIGHT * 0.5;
// Profundidade (offset em Z local, na direcao "de frente") de cada camada.
// Precisa vencer o raio do caule nessa altura (~0.56, pela interpolacao
// linear de diametro entre CAVE_MOUTH_Y e a base/topo) MAIS a metade da
// propria espessura — senao a esfera inteira fica submersa dentro do caule,
// opaco, e a caverna simplesmente nao aparece. O brilho protrai um pouco mais
// que a boca (mesma ideia do Tatu Bola: pupila mais protuberante que o
// branco do olho), pra nunca disputar o mesmo plano com ela e sofrer
// z-fighting.
const CAVE_MOUTH_PROTRUSION = 0.46 * TOWER_SCALE;

/**
 * O brilho tem que ficar a FRENTE da boca da caverna, nao dentro dela.
 *
 * Na primeira versao o brilho protraia 0.55 contra 0.46 da boca — parecia
 * suficiente, e nao era: a boca e uma elipsoide bem maior (0,85 de espessura
 * contra 0,42 de diametro do brilho), entao a frente dela ficava em 1,207 e a
 * do brilho em 1,292. So **12%** da esfera passava, e esses 12% sao a borda,
 * vista de raspao. Em device o usuario relatou "na torre nao tem nada
 * brilhando" — o brilho sempre esteve aceso, enterrado dentro da propria
 * caverna que deveria iluminar.
 *
 * Agora o centro do brilho fica FORA da superficie da boca, e a esfera aparece
 * mais que pela metade. O diametro tambem subiu, mas continua menor que a
 * abertura da boca (semi-eixo X de 0,72) — a boca escura precisa seguir
 * emoldurando o brilho, senao o efeito vira uma bola laranja colada no caule
 * em vez de luz saindo de um buraco.
 */
const CAVE_GLOW_DIAMETER = 0.52 * TOWER_SCALE;
const CAVE_GLOW_PROTRUSION = 0.74 * TOWER_SCALE;
/**
 * Quanto a esfera de brilho incha no pico da intensidade. Brilho que so muda
 * de COR quase nao le a distancia de um celular; brilho que muda de TAMANHO
 * le. E o que faz a caverna respirar em vez de so acender.
 */
const GLOW_BREATH_SCALE = 0.32;

/**
 * Halo aditivo em volta do nucleo. E a peca que faz a caverna CHAMAR.
 *
 * A primeira versao tinha so a esfera opaca, e o usuario relatou em device que
 * "nao esta chamando atencao suficiente". O problema nao era o numero da
 * intensidade — era o modelo. Uma esfera opaca com emissivo, por mais forte
 * que seja, le como bola de plastico laranja: ela OCUPA o pixel em vez de
 * SOMAR luz ao que esta atras. Em RA o que esta atras e o feed da camera de um
 * cômodo iluminado, e ai a bola perde a disputa.
 *
 * O halo resolve as duas metades disso:
 *
 * - **blending aditivo** (`ALPHA_ADD`: `COLOR = SRC_ALPHA * SRC + DEST`) — ele
 *   soma ao feed em vez de substituir, que e literalmente como luz se comporta;
 * - **queda radial suave** via `opacityTexture` com gradiente, o mesmo idioma
 *   que `src/fx/contactShadow.ts` ja usa no projeto. Silhueta dura de esfera le
 *   como objeto; borda que se dissolve le como brilho.
 *
 * `billboardMode` para o halo encarar a camera sempre: um plano visto de
 * raspao vira uma linha, e o jogador circula a arena.
 */
const HALO_DIAMETER_FACTOR = 3.4;
const HALO_MIN_ALPHA = 0.35;
const HALO_MAX_ALPHA = 0.95;
const HALO_BREATH_SCALE = 0.55;

/**
 * Quanto o nucleo caminha do laranja para o BRANCO no pico.
 *
 * Multiplicar a cor base pela intensidade so consegue escurecer — o teto e
 * sempre o proprio laranja. Brasa de verdade estoura para branco no centro
 * conforme esquenta, e e esse estouro que o olho le como "muito quente" em vez
 * de "laranja mais forte". Sem isto nao existe intensidade nenhuma que faca o
 * nucleo parecer mais que uma bolinha colorida.
 */
const CORE_WHITE_HOT_MIX = 0.75;

// Olhos: comecam fechados (fresta achatada) e `setEyesOpen` estica no eixo Y.
// "Enormes" de proposito — a referencia e olho grande de bicho escondido no
// escuro, nao olho realista.
const EYE_DIAMETER = 0.5 * TOWER_SCALE;
const EYE_OFFSET_X = 0.42 * TOWER_SCALE;
const EYE_Y = CAVE_MOUTH_Y + 0.55 * TOWER_SCALE;
// Mesma logica de protrusao da boca da caverna: o raio do caule em EYE_Y e
// menor que na base (~0.51), mas ainda exige offset > raio - metade do
// diametro do olho pra nao ficar submerso.
const EYE_PROTRUSION = 0.35 * TOWER_SCALE;
// Escala Y minima quando fechado: 0 achataria a normal da esfera e criaria
// z-fighting visivel com o caule por baixo; uma fresta fina ainda le como
// "olho fechado" sem esse problema.
const EYE_CLOSED_SCALE_Y = 0.12;
// Quanto os olhos podem girar em torno do eixo do caule para acompanhar a
// camera. Limite baixo de proposito: passando disso eles saem da boca da
// caverna e viram duas bolas contornando o cogumelo. Ajustavel depois do
// teste em device — e um numero de sensacao, nao de geometria.
const EYE_TRACK_MAX_YAW = 0.45;

// Brilho da caverna: reaproveita o laranja-ember do Javali (unica cor quente
// da paleta) em vez de criar uma entrada nova — mesmo raciocinio de reuso que
// `neutralDark`/`neutralLight` ja seguem entre as criaturas.
const CAVE_GLOW_COLOR_HEX = PALETTE.accentJavali;
// Intensidade inicial da torre inimiga: um brilho de brasa dormente, visivel
// sem ofuscar — o pulso de verdade (setGlow chamado por frame) e trabalho da
// proxima etapa.
const ENEMY_DEFAULT_GLOW = 0.55;

export interface CreateMushroomTowerOptions {
  lane: TowerLaneId;
  team: TeamId;
  /** Posicao no chao (y=0), em metros, local ao `arenaRoot`. */
  x: number;
  z: number;
}

export interface MushroomTower {
  /**
   * Filho do `arenaRoot` — TUDO desta torre pendura aqui.
   *
   * E o PROPRIO `body`, nao um no de agrupamento acima dele, e isso e
   * deliberado: cinco lugares do combate leem `tower.mesh.position` esperando
   * a posicao da torre em espaco do `arenaRoot`
   * (`CombatEngine.ts:455` e `:564`, `TowerActor.getDistanceToUnit`,
   * `BaseUnit` mirando a torre alvo). Com um root intermediario carregando o
   * deslocamento, `body.position` viraria (0,0,0) e as DUAS torres passariam a
   * ser reportadas no centro da arena: as criaturas andariam ate o meio do
   * campo e parariam, as torres atirariam no lugar errado e a checagem de
   * distancia de invocacao mentiria. Nada disso apareceria em teste — os
   * testes deste projeto sao de logica pura e nenhum monta a arena.
   */
  root: TransformNode;
  /** Alvo de picking; MANTEM o nome `tower-<cor>-<lane>` (ver comentario da classe). */
  body: Mesh;
  /** Origem das distancias e do salto do coelho (etapas futuras). */
  caveMouth: TransformNode;
  /** `null` na torre do jogador — ela nao tem olhos, so caverna apagada. */
  eyes: TransformNode | null;
  /**
   * Para que lado a boca da caverna aponta, em Z local (+1 ou -1). Quem anima
   * qualquer coisa saindo da caverna (o coelho) precisa saber para onde pular,
   * e derivar isso do time la fora duplicaria a regra.
   */
  facingSignZ: number;
  /** 0..1, continuo. Intensidade do brilho interno da caverna. */
  setGlow(intensity: number): void;
  /** 0..1, continuo. 0 = fechado/dormindo, 1 = bem aberto. No-op sem olhos. */
  setEyesOpen(open: number): void;
  /** `cameraLocal` ja convertida ao espaco local do `arenaRoot`. Sem alocacao. */
  lookAt(cameraLocal: Vector3): void;
  dispose(): void;
}

class MushroomTowerImpl implements MushroomTower {
  public readonly root: TransformNode;
  public readonly body: Mesh;
  public readonly caveMouth: TransformNode;
  public readonly eyes: TransformNode | null;
  public readonly facingSignZ: number;

  private readonly glowMaterial: StandardMaterial;
  private readonly glowMesh: Mesh;
  private readonly haloMaterial: StandardMaterial;
  private readonly haloMesh: Mesh;
  // Cor-base do brilho, guardada uma vez pra `setGlow` escalar nela sem
  // alocar um Color3 novo a cada chamada (o contrato exige zero alocacao
  // porque isto roda por frame numa etapa futura).
  private readonly glowBaseColor: Color3;
  // Yaw para onde a boca da caverna aponta. E a referencia do `lookAt`: os
  // olhos giram em torno DELA, dentro de `EYE_TRACK_MAX_YAW`.
  private readonly facingYaw: number;

  public constructor(
    body: Mesh,
    caveMouth: TransformNode,
    eyes: TransformNode | null,
    glowMaterial: StandardMaterial,
    glowMesh: Mesh,
    haloMaterial: StandardMaterial,
    haloMesh: Mesh,
    facingSignZ: number
  ) {
    this.haloMaterial = haloMaterial;
    this.haloMesh = haloMesh;
    // `root` e o proprio `body` — ver o docblock da interface.
    this.root = body;
    this.body = body;
    this.caveMouth = caveMouth;
    this.eyes = eyes;
    this.glowMaterial = glowMaterial;
    this.glowMesh = glowMesh;
    this.glowBaseColor = Color3.FromHexString(CAVE_GLOW_COLOR_HEX);
    this.facingSignZ = facingSignZ;
    this.facingYaw = Math.atan2(0, facingSignZ);
  }

  public setGlow(intensity: number): void {
    const clamped = Scalar.Clamp(intensity, 0, 1);

    // Nucleo: caminha do laranja para o branco conforme esquenta, em vez de
    // so escurecer a partir do laranja (ver `CORE_WHITE_HOT_MIX`). Escrito
    // componente a componente direto no `emissiveColor` do material — nenhum
    // `Color3` novo por frame.
    const whiteHot = CORE_WHITE_HOT_MIX * clamped * clamped;
    const emissive = this.glowMaterial.emissiveColor;
    emissive.r = this.glowBaseColor.r * clamped + whiteHot;
    emissive.g = this.glowBaseColor.g * clamped + whiteHot;
    emissive.b = this.glowBaseColor.b * clamped + whiteHot;

    // Cor E tamanho: ver `GLOW_BREATH_SCALE`. `scaling.setAll` escreve nos
    // tres eixos do Vector3 que ja existe, sem alocar.
    this.glowMesh.scaling.setAll(1 + GLOW_BREATH_SCALE * clamped);

    // O halo respira mais forte que o nucleo, e e ele quem carrega a leitura
    // a distancia.
    this.haloMaterial.alpha = Scalar.Lerp(HALO_MIN_ALPHA, HALO_MAX_ALPHA, clamped);
    this.haloMesh.scaling.setAll(1 + HALO_BREATH_SCALE * clamped);
  }

  public setEyesOpen(open: number): void {
    if (!this.eyes) {
      return;
    }

    const clamped = Scalar.Clamp(open, 0, 1);
    // Escala o NO-PAI (nao cada mesh de olho): como os dois olhos sao
    // simetricos em X ao redor da origem local deste no, escalar so o Y do
    // pai estica cada olho em torno do proprio centro sem desloca-los um em
    // direcao ao outro. Funciona igual estivessem os dois numa mesh so ou em
    // duas — a soldagem dos dois olhos (ver createEyes) so existe pra economizar
    // 1 draw call, nao muda essa conta.
    this.eyes.scaling.y = Scalar.Lerp(EYE_CLOSED_SCALE_Y, 1, clamped);
  }

  /**
   * Só os OLHOS acompanham a camera — a torre em si nao gira.
   *
   * Girar o cogumelo inteiro seria mais barato e esta errado por dois
   * motivos. Visual: um predio que pivota para seguir quem olha e
   * assombroso, nao vivo. E de design: a caverna e a placa "CUIDADO" ao lado
   * dela sao um LUGAR, que o jogador encontra circulando a arena. Se a torre
   * gira, a caverna esta sempre de frente e nao ha nada para descobrir — o
   * beat inteiro perde o motivo de existir.
   *
   * Mesmo padrao do estado "observando" do `IdleBehavior`: `atan2` direto nos
   * campos x/z, sem instanciar `Vector3`. Sem `deltaSeconds` no contrato,
   * entao sem damping aqui — quem chamar por frame decide se suaviza antes.
   */
  public lookAt(cameraLocal: Vector3): void {
    if (!this.eyes) {
      return;
    }

    const dx = cameraLocal.x - this.body.position.x;
    const dz = cameraLocal.z - this.body.position.z;
    if (dx === 0 && dz === 0) {
      return;
    }

    // Diferenca angular normalizada para [-PI, PI] sem alocar: sem isto, um
    // jogador atras da torre produziria um delta de quase 2*PI e os olhos
    // bateriam no limite do lado errado.
    const delta = Math.atan2(dx, dz) - this.facingYaw;
    const wrapped = Math.atan2(Math.sin(delta), Math.cos(delta));

    this.eyes.rotation.y =
      this.facingYaw + Scalar.Clamp(wrapped, -EYE_TRACK_MAX_YAW, EYE_TRACK_MAX_YAW);
  }

  public dispose(): void {
    // NAO usar `root.dispose(false, true)` (que descartaria material junto):
    // `body`/boca/olhos usam materiais CACHEADOS por cor (`createMatteMaterial`),
    // compartilhados com a outra torre e potencialmente com outras entidades
    // futuras da mesma cor. Descartar o cache aqui quebraria quem mais o usa.
    // So o `glowMaterial` e exclusivo desta instancia (nunca passa pelo cache,
    // por causa do emissive animado) — esse sim e responsabilidade nossa.
    this.glowMaterial.dispose();
    this.haloMaterial.dispose();
    this.body.dispose(false, false);
  }
}

/**
 * Sinal (+1/-1) do eixo Z "de frente" da torre — o lado que olha pro centro
 * da arena (z=0), onde fica o caminho e onde o jogador de fato ve a torre de
 * frente na maior parte da partida. Torre do jogador fica em z negativo
 * (frente = +z); torre inimiga fica em z positivo (frente = -z).
 */
function resolveFacingSignZ(team: TeamId): number {
  return team === "player" ? 1 : -1;
}

function createBody(scene: Scene, bodyName: string, colorHex: string): Mesh {
  const bodyMaterial = createMatteMaterial(scene, colorHex, `${bodyName}-material`);

  // Caule e chapeu nascem SEM parent (raiz da cena): `Mesh.MergeMeshes` bake-ia
  // a WORLD matrix de cada um pra dentro dos vertices do resultado, entao a
  // posicao final tem que ja estar certa aqui — se estivessem parenteados a
  // `root` antes da solda, a transformacao de `root` seria aplicada duas vezes
  // (uma vez no bake, outra de novo quando o resultado for reparenteado).
  const stem = MeshBuilder.CreateCylinder(
    `${bodyName}-stem-temp`,
    {
      diameterBottom: STEM_DIAMETER_BOTTOM,
      diameterTop: STEM_DIAMETER_TOP,
      height: STEM_HEIGHT,
      tessellation: STEM_TESSELLATION,
    },
    scene
  );
  stem.position.y = STEM_HEIGHT / 2;
  stem.material = bodyMaterial;

  const cap = MeshBuilder.CreateSphere(
    `${bodyName}-cap-temp`,
    {
      diameterX: CAP_DIAMETER_XZ,
      diameterY: CAP_DIAMETER_Y,
      diameterZ: CAP_DIAMETER_XZ,
      segments: CAP_SEGMENTS,
      slice: CAP_SLICE,
    },
    scene
  );
  cap.position.y = CAP_CENTER_Y;
  cap.material = bodyMaterial;

  // `meshSubclass` (4o argumento) preenche um Mesh ja criado com o nome certo
  // em vez de deixar o merge gerar `<nome>_merged` — assim `body` nasce com o
  // nome exigido pelo contrato (`tower-<cor>-<lane>`) sem precisar renomear
  // depois. `disposeSource = true` (2o arg) descarta caule/chapeu temporarios;
  // `allow32BitsIndices = true` (3o arg) por seguranca de orcamento de vertices,
  // embora bem abaixo do limite de 65536 aqui.
  const body = new Mesh(bodyName, scene);
  Mesh.MergeMeshes([stem, cap], true, true, body);
  body.material = bodyMaterial;

  return body;
}

/**
 * Boca da caverna: um no-marcador (`caveMouth`, origem pras distancias e pro
 * salto do coelho de uma etapa futura) com dois filhos visuais dentro dele —
 * a reentrancia escura e o brilho. Sempre criada, nas duas torres: a torre do
 * jogador so nao acende (`setGlow` nunca chamado, ou chamado com 0).
 */
function createCaveMouth(scene: Scene, body: Mesh, bodyName: string, facingSignZ: number): {
  caveMouth: TransformNode;
  glowMaterial: StandardMaterial;
  glowMesh: Mesh;
  haloMaterial: StandardMaterial;
  haloMesh: Mesh;
} {
  const caveMouth = new TransformNode(`${bodyName}-cave-mouth`, scene);
  caveMouth.parent = body;
  caveMouth.position.set(0, CAVE_MOUTH_Y, 0);

  // Reentrancia escura: mesma cor cacheada usada em olhos/pupilas de outras
  // criaturas (`neutralDark`) — nunca recebe emissive, entao e seguro passar
  // pelo cache de `createMatteMaterial` (o aviso do contrato so vale pra
  // material com emissive animado, que e so o do brilho abaixo).
  const mouthMaterial = createMatteMaterial(scene, PALETTE.neutralDark, `${bodyName}-cave-mouth-material`);
  const mouth = MeshBuilder.CreateSphere(
    `${bodyName}-cave-mouth-shape`,
    {
      diameterX: CAVE_MOUTH_DIAMETER_X,
      diameterY: CAVE_MOUTH_DIAMETER_Y,
      diameterZ: CAVE_MOUTH_DIAMETER_Z,
      segments: 10,
    },
    scene
  );
  mouth.parent = caveMouth;
  mouth.position.z = facingSignZ * CAVE_MOUTH_PROTRUSION;
  mouth.material = mouthMaterial;

  // Brilho interno: material PROPRIO (nunca cacheado — o emissive muda por
  // instancia via `setGlow`). Unlit (`disableLighting`) pra nao depender da
  // luz da cena: e uma brasa, nao uma superficie iluminada. Nasce apagado
  // (emissive preto default); quem liga e `createMushroomTower` pro time
  // inimigo, no final da construcao.
  const glowMaterial = new StandardMaterial(`${bodyName}-cave-glow-material`, scene);
  glowMaterial.disableLighting = true;
  glowMaterial.diffuseColor = Color3.Black();
  applyMatteFinish(glowMaterial);

  const glow = MeshBuilder.CreateSphere(
    `${bodyName}-cave-glow-shape`,
    { diameter: CAVE_GLOW_DIAMETER, segments: 8 },
    scene
  );
  glow.parent = caveMouth;
  glow.position.z = facingSignZ * CAVE_GLOW_PROTRUSION;
  glow.material = glowMaterial;

  const { haloMaterial, haloMesh } = createGlowHalo(scene, bodyName, caveMouth, facingSignZ);

  return { caveMouth, glowMaterial, glowMesh: glow, haloMaterial, haloMesh };
}

/**
 * Halo aditivo de luz. Ver `HALO_DIAMETER_FACTOR` para o porque.
 *
 * A opacidade vem de um gradiente radial numa `DynamicTexture`, mesmo idioma
 * de `src/fx/contactShadow.ts`: e ele que da a borda dissolvida. Sem gradiente
 * o plano vira um quadrado brilhante.
 */
function createGlowHalo(
  scene: Scene,
  bodyName: string,
  caveMouth: TransformNode,
  facingSignZ: number
): { haloMaterial: StandardMaterial; haloMesh: Mesh } {
  const size = 128;
  const texture = new DynamicTexture(`${bodyName}-halo-texture`, { width: size, height: size }, scene, true);
  texture.hasAlpha = true;

  const context = texture.getContext();
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  // Nucleo cheio, meio-termo generoso e queda longa ate zero: um degrau curto
  // demais aqui reintroduz a silhueta dura que o halo existe para dissolver.
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.72)");
  gradient.addColorStop(0.62, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  context.clearRect(0, 0, size, size);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.update();

  const haloMaterial = new StandardMaterial(`${bodyName}-halo-material`, scene);
  haloMaterial.disableLighting = true;
  haloMaterial.diffuseColor = Color3.Black();
  haloMaterial.emissiveColor = Color3.FromHexString(CAVE_GLOW_COLOR_HEX);
  haloMaterial.opacityTexture = texture;
  // `COLOR = SRC_ALPHA * SRC + DEST`: SOMA luz ao que esta atras em vez de
  // substituir. E o que faz o halo ler como brilho sobre o feed da camera.
  haloMaterial.alphaMode = Constants.ALPHA_ADD;
  haloMaterial.backFaceCulling = false;
  // Nao escreve profundidade: o halo e luz, nao superficie — ele nao pode
  // recortar o nucleo nem o proprio cogumelo atras dele.
  haloMaterial.disableDepthWrite = true;
  applyMatteFinish(haloMaterial);

  const haloDiameter = CAVE_GLOW_DIAMETER * HALO_DIAMETER_FACTOR;
  const haloMesh = MeshBuilder.CreatePlane(
    `${bodyName}-halo`,
    { width: haloDiameter, height: haloDiameter },
    scene
  );
  haloMesh.material = haloMaterial;
  haloMesh.parent = caveMouth;
  haloMesh.position.z = facingSignZ * CAVE_GLOW_PROTRUSION;
  // Sempre de frente para a camera: o jogador circula a arena, e um plano
  // visto de raspao vira uma linha.
  haloMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  haloMesh.isPickable = false;

  return { haloMaterial, haloMesh };
}

/** Par de olhos soldado numa mesh so (1 draw call) — so chamada pra torre inimiga. */
function createEyes(scene: Scene, body: Mesh, bodyName: string, facingSignZ: number): TransformNode {
  const eyes = new TransformNode(`${bodyName}-eyes`, scene);
  eyes.parent = body;
  eyes.position.set(0, EYE_Y, 0);

  // Mesma cor escura da boca da caverna: fechados, os olhos devem se
  // confundir com a sombra do caule — "dormindo" precisa ler como ausencia,
  // nao como um circulo colorido grudado no cogumelo.
  const eyeMaterial = createMatteMaterial(scene, PALETTE.neutralDark, `${bodyName}-eye-material`);

  // Cada olho nasce SEM parent e com Y=0 (nao EYE_Y): o merge bake-ia a world
  // matrix de cada um pra dentro dos vertices do resultado, e quem carrega o
  // deslocamento vertical e o no `eyes` (parent da mesh soldada), nao os
  // olhos individuais — senao o offset seria contado duas vezes (uma no bake,
  // outra herdada do parent).
  const leftEye = MeshBuilder.CreateSphere(`${bodyName}-eye-left-temp`, { diameter: EYE_DIAMETER, segments: 8 }, scene);
  leftEye.position.set(-EYE_OFFSET_X, 0, facingSignZ * EYE_PROTRUSION);

  const rightEye = MeshBuilder.CreateSphere(`${bodyName}-eye-right-temp`, { diameter: EYE_DIAMETER, segments: 8 }, scene);
  rightEye.position.set(EYE_OFFSET_X, 0, facingSignZ * EYE_PROTRUSION);

  const merged = new Mesh(`${bodyName}-eyes-shape`, scene);
  Mesh.MergeMeshes([leftEye, rightEye], true, true, merged);
  merged.material = eyeMaterial;
  merged.parent = eyes;

  return eyes;
}

export function createMushroomTower(scene: Scene, options: CreateMushroomTowerOptions): MushroomTower {
  const isEnemy = options.team === "enemy";
  const colorName = options.team === "player" ? "blue" : "red";
  const colorHex = options.team === "player" ? PALETTE.towerPlayer : PALETTE.towerEnemy;
  const bodyName = `tower-${colorName}-${options.lane}`;
  const facingSignZ = resolveFacingSignZ(options.team);

  // A POSICAO VAI NO `body`, nunca num no de agrupamento acima dele — ver o
  // docblock de `MushroomTower.root`. A geometria soldada tem a base em y = 0
  // no espaco local do mesh, entao `y = 0` ja apoia o cogumelo no chao (o
  // cilindro antigo tinha a origem no centro e precisava de y = 1.5).
  const body = createBody(scene, bodyName, colorHex);
  body.position.set(options.x, 0, options.z);

  const { caveMouth, glowMaterial, glowMesh, haloMaterial, haloMesh } = createCaveMouth(
    scene,
    body,
    bodyName,
    facingSignZ
  );
  const eyes = isEnemy ? createEyes(scene, body, bodyName, facingSignZ) : null;

  const tower = new MushroomTowerImpl(
    body,
    caveMouth,
    eyes,
    glowMaterial,
    glowMesh,
    haloMaterial,
    haloMesh,
    facingSignZ
  );

  if (isEnemy) {
    tower.setGlow(ENEMY_DEFAULT_GLOW);
    tower.setEyesOpen(0);
  } else {
    tower.setGlow(0);
  }

  return tower;
}
