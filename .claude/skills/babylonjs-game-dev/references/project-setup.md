# Setup e estrutura de um projeto WebAR

## Criar

```bash
npm create vite@latest meu-ar -- --template vanilla-ts
cd meu-ar
npm install @babylonjs/core @8thwall/engine-binary
npm install @babylonjs/loaders            # glTF/GLB
npm install @babylonjs/gui                # HUD
npm install @8thwall/coaching-overlay     # calibração de escala absoluta
npm install -D @babylonjs/inspector
```

Copie os artefatos do engine para a pasta pública (script `postinstall` ou plugin de
cópia do Vite): `node_modules/@8thwall/engine-binary/dist` → `public/external/xr`.

## `vite.config.ts`

```ts
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true, target: "es2020" },
  server: { host: true },   // testar no celular na mesma rede
});
```

Fora de `localhost` a câmera exige HTTPS: `ngrok http <porta>` apontando para o dev
server.

## `tsconfig.json` — o que importa aqui

```jsonc
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

`strict: true` pega bastante erro de coordenada/eixo trocado em tempo de compilação.

## Imports

Sempre por caminho específico — é o que dá tree-shaking real e derruba o tamanho do
bundle, que em AR compete com o download do próprio engine:

```ts
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
// Evitar: import * as BABYLON from "@babylonjs/core";
```

Loaders: registre dinamicamente, em vez de importar tudo.

```ts
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
registerBuiltInLoaders();
```

Assets pesados (`.glb`, texturas, áudio) vão em `public/` e são carregados por URL —
não importados como módulos. Um `.glb` que referencia textura externa (`"uri":
"Textures/x.png"`) precisa da pasta **ao lado** do arquivo em `public/`.

### Imports de efeito colateral: a classe de bug mais cara

Parte da API do Babylon não vive na classe — é **anexada ao protótipo** por um
módulo que você tem que importar só pelo efeito colateral. Com imports granulares
ninguém traz esses módulos junto, e o resultado é sempre o mesmo: `tsc --noEmit`
limpo, `npm run build` limpo, e explosão em runtime na primeira interação — em
device, a dez metros de casa.

```ts
import "@babylonjs/core/Culling/ray";   // scene.pick, scene.createPickingRay
```

Sem ele, **todo toque** lança `Ray needs to be imported before as it contains a
side-effect required by your code`. Se o picking é o mecanismo de colocação do
seu jogo (chão digital, ver `SKILL.md` §2a), isso é o app inteiro.

Nenhuma checagem estática pega isso. O que pega é um teste que afirma que a linha
continua no arquivo — feio, e mais barato que uma sessão de device perdida.

## Estados do jogo

Um jogo de AR tem pelo menos três fases distintas: **pré-AR** (tela de permissão/
instruções), **calibração** (coaching overlay até `NORMAL`), **jogo**. Cada uma tem seus
recursos para liberar.

```ts
export abstract class GameState {
  abstract enter(): Promise<void> | void;
  abstract update(deltaMs: number): void;
  abstract exit(): void;
}
```

A regra que muda em AR: **o estado de AR não cria a própria `Scene`/câmera** — ele recebe
as duas de `XR8.Babylonjs.xrScene()` e as guarda. E o `exit()` dele precisa de
`XR8.stop()` além de `scene.dispose()`, porque a câmera do dispositivo continua ligada.
Os estados não-AR seguem o padrão normal (`new Scene(engine)` no `enter()`,
`scene.dispose()` no `exit()`).

Movimento e timers sempre multiplicados por `engine.getDeltaTime()` (ms) — nunca assuma
60 fps, que em AR mobile é justamente o que não acontece.

## Inspector

```ts
if (import.meta.env.DEV) {
  import("@babylonjs/inspector").then(() => scene.debugLayer.show());
}
```

Só em dev. No device ele não substitui logar na própria tela: celular não tem console
acessível.
