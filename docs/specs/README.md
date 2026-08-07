# Specs de execucao — calibracao de RA, menu de modo e orientacao

Cada spec aqui e **auto-contido**: foi escrito para ser executado por um agent
com modelo menor, sem acesso ao contexto da investigacao que os originou. Se um
spec exige que voce va ler outro spec para entender o que fazer, ele esta errado.

## Por que existem ondas

As mudancas convergem nos mesmos arquivos (`EighthWallARManager.ts`, `main.ts`,
`index.html`, `src/types/xr8.d.ts`, `HudLayer.ts`). Rodar agents em paralelo
sobre esses arquivos gera edicoes que se sobrescrevem. A saida e **contratos
primeiro**: uma onda serial curta fixa tipos e assinaturas, e so entao as ondas
paralelas rodam, cada agent com um conjunto **exclusivo** de arquivos gravaveis.

| Onda | Specs | Execucao |
| --- | --- | --- |
| 0 | [00-contratos](00-contratos.md) | serial, um agent — destrava todo o resto |
| 1 | [01](01-coaching-overlay-wrapper.md), [02](02-diagnostics-overlay.md), [03](03-start-screen.md), [04](04-game-flow.md), [05](05-gates-de-gameplay.md) | **paralela**, um agent por spec |
| 2 | [06-integracao](06-integracao.md) | serial, um agent — e onde tudo se encontra |
| 3 | HUD responsivo | condicional: so existe se o teste de device da onda 0 apontar portrait |

Onda 1 so comeca depois que a onda 0 passar em `npx tsc --noEmit`.

## Mapa de arquivos exclusivos

Nenhum arquivo aparece em dois specs da mesma onda. Se voce precisar editar um
arquivo que nao esta na sua lista, **pare e reporte** em vez de editar.

| Spec | Arquivos gravaveis |
| --- | --- |
| 00 | `src/types/xr8.d.ts`, `index.html`, `package.json`, `scripts/copy-8thwall.mjs`, + stubs em `EighthWallARManager.ts`, `CombatEngine.ts`, `CardDeckHud.ts`, `HudLayer.ts`, `screenOrientation.ts` |
| 01 | `src/ar/coachingOverlay.ts` (novo) |
| 02 | `src/ui/DiagnosticsOverlay.ts` (novo) |
| 03 | `src/ui/StartScreen.ts` (novo) |
| 04 | `src/game/GameFlow.ts` (novo) |
| 05 | `src/combat/CombatEngine.ts`, `src/ui/CardDeckHud.ts`, `src/ui/HudLayer.ts` |
| 06 | `src/ar/EighthWallARManager.ts`, `src/main.ts`, `README.md`, `src/ui/ToggleSwitch.ts` (remocao) |

## Convencoes obrigatorias para todos os specs

Valem para qualquer codigo produzido a partir destes specs:

1. **Leia `.github/copilot-instructions.md` e `README.md` antes de codar** —
   e obrigatorio por `AGENTS.md` e contem as regras de arquitetura do projeto.
2. **Imports granulares**: `import { Vector3 } from "@babylonjs/core/Maths/math.vector"`.
   Nunca `import * as BABYLON`. Controles de GUI vem de `@babylonjs/gui`.
3. **Comentarios e nomes em pt-BR sem acentos**, como todo o resto do codigo.
   Comentario explica *por que*, nunca *o que* — se o codigo ja diz o que faz,
   nao comente.
4. **UI nova entra na textura compartilhada** via `hud.getTexture()`. Nunca crie
   outra `AdvancedDynamicTexture` fullscreen (ver `src/ui/HudLayer.ts:33-38`).
5. **Todo recurso criado dinamicamente precisa de `dispose()`**, encadeado a
   partir de `scene.onDisposeObservable` em `src/main.ts`.
6. **Nada de RA pode ser validado no desktop** — o SLAM so roda no celular.
   Entregue codigo verificavel por tipo e teste; a validacao funcional e feita
   depois em device.
7. Ao final do seu spec, `npx tsc --noEmit && npm run test` tem que passar.
8. **Nao commite, nao rode `npm install`, nao edite arquivo fora da sua lista.**

## Contexto minimo do projeto

Jogo de cartas em lanes (estilo Clash Royale) em RA, Babylon.js + TypeScript +
Vite. A RA usa o engine 8th Wall (SLAM por camera, `@8thwall/engine-binary`),
nao WebXR — funciona no Safari do iPhone. Mundo em metros, `scale: "absolute"`.
O jogo tambem roda em modo "tela" (canvas 3D comum, sem camera), e **a logica de
jogo tem que ser independente do modo de render**.
