# Tower Gate

Jogo de cartas com lanes em Realidade Aumentada (RA), inspirado na leitura de campo do Clash Royale.

## Estado Atual

- Foco atual: validar arena inicial em modo normal e RA com toggle no Babylon GUI.
- Entrega já concluída nesta etapa:
- arena com blocos de gramado (verde), rio (azul) e caminho (amarelado)
- torres placeholder com cilindros azuis e vermelhos
- toggle de RA sem UI HTML

## Roadmap de Fases

| Concluida | Fase | Tarefa | Objetivo | Status |
| --- | --- | --- | --- | --- |
| [ ] | 01 | Arena Anchor | Garantir que a arena $60cm \times 40cm$ fique travada na mesa sem tremer. | Em andamento |
| [ ] | 02 | Unit Spawner | Criar um botão na tela que, ao clicar, instancia um Cubo 3D que anda para frente na arena. | Nao iniciada |
| [ ] | 03 | Shadows & Life | Adicionar ShadowGenerator para o cubo projetar sombra na arena e uma animacao simples de pular (squash and stretch) enquanto anda. | Nao iniciada |
| [ ] | 04 | Targeting | Fazer o cubo detectar a torre (cilindro no fim da lane), parar de andar e comecar a atacar (mudar de cor ou soltar particulas). | Nao iniciada |

## Critério de Conclusão da Fase 01

- Arena ancorada em RA com estabilidade visual.
- Sem jitter perceptível durante movimentos naturais do dispositivo.
- Entrada e saída do modo RA sem perder posicionamento da arena.

## Como Rodar

- Instalar dependências:

```bash
npm install
```

- Executar em desenvolvimento:

```bash
npm run dev
```

- Build de produção:

```bash
npm run build
```
