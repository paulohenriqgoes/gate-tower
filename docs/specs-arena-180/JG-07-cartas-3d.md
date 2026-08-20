# JG-07 — Cartas presas ao jogador; o HUD 2D de combate morre

**Objetivo:** as cartas saem da barra inferior e viram objetos 3D presos ao
jogador, na diagonal inferior, girando com ele. A barra de recurso desaparece: a
leitura passa a ser "carta acesa ou apagada".

## Ponto de partida

`src/ui/CardDeckHud.ts` (303 linhas) e a leitura de recurso do jogo hoje, e e
justamente o que a v3 mata. `src/ui/DiamondCard.ts` tem a arte da carta, que e
**reaproveitada como textura** — nao redesenhada.

Duas armadilhas ja pagas por este projeto, nomeadas para nao serem repetidas:

- **`DynamicTexture.update()`, nunca `update(false)`.** O `false` sobe a textura
  de cabeca para baixo e **sobrevive em arte simetrica** — so denuncia no primeiro
  texto desenhado;
- **UI nova entra na textura compartilhada** via `hud.getTexture()`. Nunca crie
  outra `AdvancedDynamicTexture` fullscreen.

## Some junto: o controle de "Sua altura" (decisao de 2026-08-20)

**Tire da tela os dois `HeightStepper`** — o da tela inicial (`StartScreen.ts`) e
o da fase de colocacao da RA (`EighthWallARManager.createHeightStepperUI`). A
decisao e do dono do projeto e tem duas pernas, uma de produto e uma de
evidencia:

- **produto:** perguntar a altura do jogador nao e um campo que deva existir na
  tela deste jogo;
- **evidencia:** o device de 2026-08-20 provou que o numero **nao chega ao
  engine**. Em `scale: "absolute"` o 8th Wall sobrescreve `origin.y` para 1 m —
  quatro colocacoes com 1,55 declarado deram distancia camera-origem de 1,0049,
  0,9797, 1,0134 e 1,0043. O controle mexia num valor que o tracker descarta.
  Ver a hipotese 8 do [diario](../experimentos/arena-180-atencao.md).

O que **fica**: `src/ar/playerHeight.ts` e o teste dele continuam valendo como
normalizacao e guarda de valor nao-finito de `origin.y` (`origin` com NaN
contamina o frame do engine de forma permanente). O que sai e a UI e a
persistencia em `localStorage`; a altura volta a ser constante, como era antes da
RA-F3, **e o piso passa a depender de onde o jogador segura o celular no gesto de
colocacao** — que e o que o engine de fato usa.

## Arquivos-alvo

`src/ui/HandCards3D.ts` (novo), `src/ui/HandCards3D.test.ts` (novo — so a logica
de layout e estado), `src/ui/CardDeckHud.ts` (removido),
`src/ui/DiamondCard.ts`, `src/ui/HudLayer.ts`, `src/cards/cardCatalog.ts`.

## Contrato

```ts
export type CardKind = "autonoma" | "mira" | "informacao" | "negacao";

export interface CardDefinition {
  id: string; name: string; summary: string; cost: number;
  accentColor: string;
  kind: CardKind;          // define a cor de contorno (spec v3 §7)
}

export class HandCards3D {
  constructor(scene: Scene, camera: Camera, deck: CardDeckSystem);
  onCardPressedObservable: Observable<string>;
  onCardReleasedObservable: Observable<string>;
  /** DJ-8 — fade para 35% durante a mira; a carta pressionada nunca faz fade. */
  setFadedForAiming(faded: boolean): void;
  dispose(): void;
}
```

Quads **unlit** de alto contraste, parentados a um `TransformNode` filho da
camera. Mao de 4 slots; slot vazio renderiza como contorno tracejado.

Unlit nao e escolha estetica: sob a luz de ambiente real, texto em quad 3D fica
**ilegivel**. Todo elemento que precisa ser lido e unlit e de alto contraste.

## Criterio de aceite

Girando o tronco, as cartas acompanham sem lag perceptivel; legiveis com o
celular a braco estendido em retrato; carta impagavel fica visivelmente apagada;
nao existe mais nenhuma barra de recurso nem fileira 2D de cartas na tela;
`HudLayer` so desenha timer, HP da torre e setas.

## Como validar

`npm test && npm run build`, e device: ler as quatro cartas de relance
**enquanto gira**.

## Fora de escopo

O livro de cartas (adiado pela propria spec v3); o album (JG-11).

## Sub-agents

| Tarefa | Agent | Modelo | Roda em paralelo com |
| --- | --- | --- | --- |
| `HandCards3D` + remocao do `CardDeckHud` + `kind` no catalogo | `general-purpose` | `sonnet` — implementacao dentro de contrato; as armadilhas de GUI e textura ja estao nomeadas | — |

## Depende de

JG-02, JG-06. **Serial contra a JG-05**: as duas escrevem `src/ui/HudLayer.ts`.
