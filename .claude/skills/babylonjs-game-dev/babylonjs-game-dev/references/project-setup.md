# Setup de Projeto — Babylon.js + TypeScript + Vite

## Por que Vite

Vite é hoje a opção recomendada pela própria documentação do Babylon.js para novos projetos: dev server com hot-reload rápido, config simples e build otimizado (tree-shaking real) para produção. Webpack ainda funciona, mas exige configuração manual maior sem trazer vantagem para a maioria dos jogos.

## Criando o projeto

```bash
npm create vite@latest meu-jogo -- --template vanilla-ts
cd meu-jogo
npm install @babylonjs/core
```

Pacotes adicionais conforme a necessidade do jogo (não instale tudo de uma vez — cada um aumenta o bundle):

```bash
npm install @babylonjs/loaders   # importar glTF/GLB, OBJ, STL, splat...
npm install @babylonjs/havok     # física (WebAssembly)
npm install @babylonjs/gui       # UI 2D/3D (menus, HUD)
npm install @babylonjs/materials # materiais extras (grid, water, etc.)
npm install @babylonjs/inspector --save-dev # debug layer, só em dev
```

## Estrutura de pastas sugerida

Uma estrutura que separa "engine/infra" de "conteúdo de jogo" escala bem à medida que o projeto cresce:

```
meu-jogo/
├── public/                # assets estáticos servidos como estão (modelos, texturas, áudio)
│   └── assets/
│       ├── models/
│       ├── textures/
│       └── audio/
├── src/
│   ├── main.ts             # ponto de entrada: cria Engine, inicia o primeiro State
│   ├── core/                # infraestrutura reutilizável entre jogos
│   │   ├── Game.ts          # classe raiz: Engine, canvas, render loop
│   │   ├── StateManager.ts  # máquina de estados (ver architecture.md)
│   │   └── AssetLoader.ts   # wrapper de carregamento de assets
│   ├── states/               # cada estado do jogo (menu, gameplay, pause...)
│   │   ├── MenuState.ts
│   │   └── GameplayState.ts
│   ├── entities/              # personagens, inimigos, itens
│   └── systems/                # física, input, áudio, câmera
├── index.html
├── tsconfig.json
└── vite.config.ts
```

Assets pesados (modelos 3D, texturas, áudio) vão em `public/`, não são importados como módulos TypeScript — isso evita nomes de arquivo ofuscados pelo bundler e mantém o carregamento assíncrono simples via URL relativa.

## `vite.config.ts` mínimo

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    host: true, // permite testar no celular na mesma rede
  },
});
```

## `tsconfig.json`

Pontos que importam especificamente para Babylon.js:

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`strict: true` vale a pena desde o início — a tipagem do Babylon.js é rica (vetores, matrizes, meshes tipados) e pega bastante erro de coordenadas/eixos trocados em tempo de compilação.

## Imports: modular vs UMD

Com bundler, sempre prefira os imports por caminho específico do `@babylonjs/core` em vez do pacote UMD global (`babylonjs`). Isso é o que permite ao Vite remover do bundle final tudo que o jogo não usa (física, GUI, loaders específicos etc.):

```ts
// Preferido em projetos com bundler
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

// Evitar em produção (importa o pacote inteiro, quebra tree-shaking)
// import * as BABYLON from "@babylonjs/core";
```

Para os loaders (glTF etc.), prefira registrar dinamicamente em vez de importar tudo estaticamente — o Babylon.js já expõe uma função para isso que só baixa o loader específico quando o primeiro modelo daquele tipo é carregado (ver `gameplay-systems.md`).

## `main.ts` de entrada

```ts
import { Engine } from "@babylonjs/core/Engines/engine";
import { Game } from "./core/Game";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { powerPreference: "high-performance" });

const game = new Game(engine, canvas);
game.start();

window.addEventListener("resize", () => engine.resize());
```

`powerPreference: "high-performance"` pede ao navegador para usar a GPU dedicada (quando existir) em vez da integrada — vale a pena em jogos, já que o consumo de bateria é uma troca aceitável por FPS estável.

## Debug layer (Inspector)

Importe o Inspector só em desenvolvimento (ele é pesado e não deve ir para produção):

```ts
if (import.meta.env.DEV) {
  import("@babylonjs/inspector").then(() => {
    scene.debugLayer.show();
  });
}
```

## Deploy

`npm run build` gera `dist/` — é um site estático, então qualquer host de arquivos estáticos serve (GitHub Pages, Netlify, Vercel, Cloudflare Pages). Não há servidor/backend necessário a menos que o jogo tenha multiplayer ou leaderboard.
