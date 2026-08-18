Tower Gate - Instruções de Desenvolvimento (Copilot)

O que o jogo é, em que estado ele está e para onde vai: leia o `README.md`. Ele é
leitura obrigatória por `AGENTS.md`, e é a única fonte da descrição do projeto —
não repita objetivo, mecânica nem escopo aqui, ou os dois arquivos envelhecem em
direções diferentes. Este arquivo cobre só o **como**: tecnologia, arquitetura e
padrões de código.

1. Restrições e Tecnologias
Engine: Babylon.js (RA via engine 8th Wall — SLAM na câmera; WebXR não é mais utilizado).

Visualização: Deve existir um toggle (alternador) para ativar/desativar o modo RA em tempo real. A lógica do jogo deve ser independente do modo de renderização (Canvas 3D vs. RA 8th Wall).

Postura do Desenvolvedor: Atuar como um Dev Senior. O código deve ser modular, limpo, manutenível e seguir os princípios SOLID.

Performance: Uso de InstancedMesh, gestão otimizada de ShadowGenerators e draw calls reduzidos para garantir 60 FPS em mobile.

Commit Messages: Devem ser claros, concisos e descritivos, seguindo o formato "feat:", "fix:", "refactor:", etc. idioma: Português (Brasil).

2. Arquitetura Modular Obrigatória
Todo código deve ser organizado nos seguintes módulos:

AR Manager: Gerencia a sessão RA via 8th Wall (`EighthWallARManager`), a ancoragem da arena no chão estimado pelo SLAM e o estado do toggle RA.

Arena System: Define os limites do campo de batalha, a geometria de setores e a detecção de colisões.

Unit Factory: Padrão Factory para instanciar tropas e torres.

Combat Engine: Processa os dados de ATK/DEF, aplicação de itens e a Máquina de Estados (State Machine) das unidades (Idle, Walk, Attack, Death).

3. Diretrizes Técnicas Sênior
Input Agnóstico: A lógica de "lançar cartas" deve funcionar via Touch (tela) ou Hardware (ex: NFC/Gamepad), sem acoplamento direto com a UI.

Imersão Visual: Materiais mate e de paleta limitada (`applyMatteFinish`, em `src/fx/materials.ts`). Objetos são ancorados ao piso por blob de sombra de contato (`src/fx/contactShadow.ts`), nunca por shadow map — ele é caro em mobile e frágil fora da escala 1. Todo elemento que precisa ser **lido** (cartas, texto diegético) é unlit e de alto contraste: sob a luz de ambiente real, texto em quad 3D fica ilegível. PBR e Environment Probe só entram onde houver ganho medido — em RA, a câmera e o SLAM já consomem o orçamento de frame.

Ancoragem: Garantir que, no modo RA, objetos não deslizem (uso de Anchors robustos).

Feedback: Implementar feedback tátil (vibração) e sonoro posicional para todas as interações de combate.
