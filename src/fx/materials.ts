import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Paleta unica do jogo (Etapa 9). Nomeada por papel, nao por criatura
 * especifica — quem usa cada cor fica documentado no comentario, nao no
 * nome. Toda cor do jogo deve vir daqui (ArenaSystem e as criaturas nao tem
 * mais hex cru espalhado).
 *
 * Cor dominante nunca e marrom nem bege (guideline de personagens, secao 4):
 * essa regra vale com forca dupla para grama+caminho, porque juntos cobrem a
 * maior parte da tela e "mesa de madeira" e exatamente o fundo contra o qual
 * marrom/bege desaparecem. O caminho era amarelado (#c79d3b/#e3c06e, tom
 * bege-mostarda) e virou um slate-violeta — mesma leitura de "trilha", sem
 * cair na faixa proibida.
 */
export const PALETTE = {
  // Arena — chao (xadrez de duas tonalidades por elemento, ver ArenaSystem)
  grassBase: "#2f7d4f",
  grassAccent: "#469468",
  pathBase: "#5b5a8f",
  pathAccent: "#7d7cb0",
  riverBase: "#2a6fa5",
  riverAccent: "#4ea0d6",

  // Arena — torres
  towerPlayer: "#2f6fff",
  towerEnemy: "#df3e3e",

  // Criaturas — cor de acento (a cor dominante que identifica a carta a
  // distancia, no papel do guideline). Cada uma tambem vira accentColor da
  // carta correspondente em cardCatalog.ts.
  accentJavali: "#f97316",
  accentBarata: "#f472b6",
  accentCururu: "#4dc3d9",
  accentTatu: "#7c3aed",

  // Neutros compartilhados entre criaturas: patas, antenas, pupilas (escuro)
  // e olhos/presas (claro). Reaproveitados de proposito — ver
  // createMatteMaterial.
  neutralDark: "#1f2733",
  neutralLight: "#f1f5f9",
} as const;

export type PaletteColorKey = keyof typeof PALETTE;

// Cache de materiais mate por cena e por cor. RA roda SLAM + render no mesmo
// frame no celular, entao menos materiais unicos (= menos trocas de estado de
// shader) importa de verdade aqui. WeakMap por Scene: quando a cena e
// descartada, a entrada correspondente cai junto sem precisar de limpeza
// manual.
const materialCacheByScene = new WeakMap<Scene, Map<string, StandardMaterial>>();

/**
 * Material mate (acabamento fosco do guideline: `specularColor` zerado, sem
 * brilho especular) para a cor hex dada. Nao aplica nenhum tipo de contorno —
 * o "sem contorno" do guideline e apenas a ausencia de qualquer efeito de
 * silhueta/outline, entao nao ha nada a fazer aqui alem de nao adicionar um.
 *
 * Cache por cena+cor: se `colorHex` ja foi pedido nesta `scene`, devolve a
 * MESMA instancia de material em vez de criar outra. O parametro `name` so
 * importa na primeira chamada (vira o nome do material criado); chamadas
 * seguintes com a mesma cor ignoram o nome novo e devolvem o material
 * cacheado — por isso esta funcao serve apenas para materiais "planos" (sem
 * emissive/textura customizados por instancia). Efeitos deliberados como
 * aneis de selecao, barras de vida ou brilhos (emissive) NAO devem passar por
 * aqui: crie-os com `new StandardMaterial` + `applyMatteFinish` para nao
 * arriscar dois usos diferentes da mesma cor colidirem no cache.
 */
export function createMatteMaterial(scene: Scene, colorHex: string, name: string): StandardMaterial {
  let sceneCache = materialCacheByScene.get(scene);
  if (!sceneCache) {
    sceneCache = new Map<string, StandardMaterial>();
    materialCacheByScene.set(scene, sceneCache);
  }

  const cached = sceneCache.get(colorHex);
  if (cached) {
    return cached;
  }

  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(colorHex);
  applyMatteFinish(material);

  sceneCache.set(colorHex, material);
  return material;
}

/**
 * Zera o especular de um material ja existente, sem mexer em mais nada
 * (emissive deliberado continua intacto). Uso: materiais que
 * `createMatteMaterial` nao cobre — os de textura (`DynamicTexture` xadrez do
 * chao da arena) e os com emissive proprio por instancia (aneis de selecao,
 * curlers da Dona Barata, lingua do Cururu).
 */
export function applyMatteFinish(material: StandardMaterial): void {
  material.specularColor = Color3.Black();
}

/**
 * Deriva uma variante mais escura (factor < 1) ou mais clara (factor > 1) de
 * uma cor da paleta, mantendo o matiz. Usada para o "valor escuro na base,
 * claro no topo" do guideline (secao 4) sem precisar de uma entrada nova na
 * paleta para cada sombra/realce — ex.: o casco do Tatu Bola usa
 * `shadeHex(PALETTE.accentTatu, 0.55)` para as faixas, em vez de uma cor
 * nomeada separada.
 */
export function shadeHex(colorHex: string, factor: number): string {
  const color = Color3.FromHexString(colorHex).scale(factor);
  color.r = Scalar.Clamp(color.r, 0, 1);
  color.g = Scalar.Clamp(color.g, 0, 1);
  color.b = Scalar.Clamp(color.b, 0, 1);
  return color.toHexString();
}
