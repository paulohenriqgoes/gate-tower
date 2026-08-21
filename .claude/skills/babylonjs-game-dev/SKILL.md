---
name: babylonjs-game-dev
description: Boas práticas para criar e estruturar jogos com Babylon.js + TypeScript, com foco grande em AR/XR imersivo via integração com o 8th Wall (agora open source). Use ao criar um projeto Babylon.js, estruturar cenas/estados/entidades, otimizar performance (FPS, draw calls, instancing), carregar assets 3D (glTF/GLB), configurar física (Havok), input, câmeras, áudio, ou build (Vite+TS). Acione TAMBÉM para qualquer pedido de AR, realidade aumentada, WebAR, world tracking, SLAM, image targets, face effects, ou 8th Wall/8thwall, mesmo sem menção a Babylon.js. Use TAMBÉM para testar jogo Babylon.js sem browser (Vitest/Jest com NullEngine, teste headless, o que dá para testar sem device). Cobre casos como criar um jogo em babylon.js, cena lenta, estruturar states, carregar um glb, física no jogo babylon, jogo travando no celular, jogo de AR que roda no navegador do celular, integrar 8th wall no projeto, ou escrever teste automatizado de gameplay. Não necessária para perguntas triviais e pontuais da API que não envolvam arquitetura, performance, AR/XR ou organização de projeto.
---

# Babylon.js — Boas Práticas para Jogos

Esta skill reúne padrões consolidados (docs oficiais, comunidade e experiência de produção) para criar jogos com **Babylon.js + TypeScript + Vite** — incluindo um foco grande em **experiências imersivas de AR/XR** via integração com o **8th Wall**, hoje open source. Ela existe porque Babylon.js (e o 8th Wall) são flexíveis o bastante para permitir que um jogo "funcione" de várias formas ruins — e os problemas (queda de FPS, memory leak, cenas impossíveis de manter, tracking instável em AR) só aparecem quando o projeto já cresceu. O objetivo aqui é evitar esses problemas desde o início.

## Como usar esta skill

1. Identifique em qual fase o usuário está: **iniciando um projeto**, **estruturando o jogo** (cenas, estados, entidades), **implementando sistemas de gameplay** (assets, física, input, áudio, câmera), **otimizando performance**, ou **construindo uma experiência AR/XR** com 8th Wall.
2. Leia o(s) arquivo(s) de referência relevantes abaixo antes de escrever código — cada um cobre um domínio específico com exemplos em TypeScript.
3. Aplique os padrões aos arquivos reais do projeto do usuário, não apenas cole exemplos genéricos — adapte nomes, estrutura de pastas e convenções ao que já existe no repositório, se houver.
4. Se o pedido cruzar mais de um domínio (ex.: "cria o projeto do zero e já bota um personagem com física andando" ou "quero um jogo de AR com física"), leia todos os arquivos relevantes antes de começar a codar — as decisões de arquitetura no início afetam como física/assets/input/AR se encaixam depois.
5. Para qualquer pedido de AR/XR, leia `references/ar-xr-8thwall.md` **mesmo que o usuário não peça explicitamente "boas práticas"** — a forma como o 8th Wall assume o controle da câmera e do ciclo de vida muda decisões de arquitetura que os outros arquivos de referência assumem como padrão (ex.: quem cria a `Scene`/câmera).

## Referências

| Arquivo | Quando ler |
|---|---|
| `references/project-setup.md` | Início de um projeto novo: estrutura de pastas, Vite + TypeScript, `tsconfig.json`, imports do `@babylonjs/core` vs UMD, build/deploy. |
| `references/architecture.md` | Organizar o jogo: `Engine`/`Scene`, máquina de estados (menu, loading, gameplay, pause), gerenciamento de cenas, padrão de "game loop", ciclo de vida e `dispose()`. |
| `references/gameplay-systems.md` | Implementar sistemas: carregar modelos (glTF/GLB), física com Havok, câmeras, input de jogador, áudio, GUI. |
| `references/testing-nullengine.md` | Escrever teste de jogo sem browser: `NullEngine` no Vitest/Jest, o que testar puro vs. com engine, e as cinco armadilhas do headless (`OffscreenCanvas`, side-effect modules, `scene.render()`, os dois relógios, monkey-patch de `performance.now`). |
| `references/performance.md` | Otimizar: instancing/thin instances, draw calls, merging de meshes, texturas, `SceneOptimizer`, profiling, cuidados com mobile. |
| `references/ar-xr-8thwall.md` | Experiências de **AR/XR imersivo** com **8th Wall**: setup self-hosted (a plataforma antiga foi aposentada), licenciamento (o que é MIT vs o binário com SLAM), Camera Pipeline Modules, integração da câmera/cena do 8th Wall com Babylon.js, world tracking, hit test, image targets, cuidados de performance específicos de AR em mobile, **troubleshooting de drift e grounding em AR** (os dois tipos de drift, place-once por hitTest, crash do WASM, sombra de contato, esconder o grid), **coaching e onboarding do jogador** (escala absoluta, coaching overlay oficial, `NORMAL` como critério de calibrado, o que as guidelines do 8th Wall pedem do ambiente), e **orientação de tela (landscape/portrait), fullscreen e travamento de rotação em AR** (como o engine consome `screen.orientation` a cada frame, por que trocar de orientação no meio da sessão estica a cena). |

## Princípios que atravessam todos os domínios

Estes valem para qualquer código gerado com esta skill, independente do arquivo de referência usado:

- **TypeScript com imports granulares.** Prefira `import { Vector3 } from "@babylonjs/core/Maths/math.vector"` a `import * as BABYLON from "@babylonjs/core"` em projetos que usam bundler (Vite/Webpack) — isso permite tree-shaking e reduz drasticamente o tamanho do bundle final. O import "wildcard" só faz sentido em protótipos rápidos ou quando o projeto ainda está em fase de exploração.
- **`dispose()` é parte do design, não um detalhe.** Toda mesh, material, textura e som criado dinamicamente (ex.: ao trocar de fase, remover um inimigo) precisa de um plano claro de quem chama `dispose()` e quando. Isso deveria ser decidido junto com a arquitetura, não adicionado depois que o jogo já vaza memória.
- **Meça antes de otimizar.** Sugestões de performance (instancing, merging, etc.) valem a pena quando o gargalo é real — recomende ao usuário manter um contador de FPS ou usar o Inspector do Babylon.js (`scene.debugLayer.show()`) durante o desenvolvimento, para que decisões de otimização sejam baseadas em dados, não em suposição.
- **Teste a fiação, não só a regra.** Lógica de jogo pura (fórmulas, tabelas, máquinas de estado) deve nascer em arquivo sem `import` de `@babylonjs/*`, com teste ao lado — mas parar aí deixa sem rede o erro mais caro: alvo atribuído ao objeto errado, observable que nunca dispara, unidade que para de andar, `dispose()` que esquece um observer. Esses só aparecem com as peças ligadas, e `NullEngine` liga todas elas em milissegundos, dentro do Vitest, sem browser. Sempre que um sistema tiver mais de um colaborador (engine de combate, spawner, máquina de fases), proponha o teste headless junto — ver `references/testing-nullengine.md`.
- **Física e colisão de gameplay são conceitos diferentes.** Não assuma que o usuário quer o motor de física completo (Havok) só porque precisa de "colisão" — verificar `mesh.intersectsMesh()` ou usar o sistema de colisão de câmera do Babylon costuma bastar para jogos mais simples, e evita a complexidade (e o peso do WASM) de um motor de física completo.
