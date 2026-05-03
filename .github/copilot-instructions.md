Tower Gate - Instruções de Desenvolvimento (Copilot)
1. Objetivo do Projeto
Desenvolver um jogo de cartas com mecânica de lanes (estilo Clash Royale) em Realidade Aumentada (RA). O jogo deve oferecer uma experiência imersiva onde unidades digitais interagem com o espaço físico (mesa/chão) de forma convincente.

2. Restrições e Tecnologias
Engine: Babylon.js (foco em WebXR).

Visualização: Deve existir um toggle (alternador) para ativar/desativar o modo RA em tempo real. A lógica do jogo deve ser independente do modo de renderização (Canvas 3D vs. WebXR).

Postura do Desenvolvedor: Atuar como um Dev Senior. O código deve ser modular, limpo, manutenível e seguir os princípios SOLID.

Performance: Uso de InstancedMesh, gestão otimizada de ShadowGenerators e draw calls reduzidos para garantir 60 FPS em mobile.

Commit Messages: Devem ser claros, concisos e descritivos, seguindo o formato "feat:", "fix:", "refactor:", etc. idioma: Português (Brasil).

3. Arquitetura Modular Obrigatória
Todo código deve ser organizado nos seguintes módulos:

XR Manager: Gerencia a sessão WebXR, o Hit Test para ancorar a arena e o estado do toggle RA.

Arena System: Define os limites do campo de batalha, navegação (lanes) e detecção de colisões.

Unit Factory: Padrão Factory para instanciar tropas e torres.

Combat Engine: Processa os dados de ATK/DEF, aplicação de itens e a Máquina de Estados (State Machine) das unidades (Idle, Walk, Attack, Death).

4. Diretrizes Técnicas Sênior
Input Agnóstico: A lógica de "lançar cartas" deve funcionar via Touch (tela) ou Hardware (ex: NFC/Gamepad), sem acoplamento direto com a UI.

Imersão Visual: Priorizar Shaders PBR (Physically Based Rendering) e iluminação que reaja ao ambiente real (Environment Probe).

Ancoragem: Garantir que, no modo RA, objetos não deslizem (uso de Anchors robustos).

Feedback: Implementar feedback tátil (vibração) e sonoro posicional para todas as interações de combate.