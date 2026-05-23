# Tower Gate

Jogo de cartas com lanes em Realidade Aumentada (RA), inspirado na leitura de campo do Clash Royale.

## Estado Atual

- Foco atual: fechar a estabilidade e o reposicionamento da arena em RA e adicionar feedback visual de combate.
- Entrega já concluída nesta etapa:
- arena com blocos de gramado (verde), rio (azul) e caminho (amarelado)
- torres placeholder com cilindros azuis e vermelhos
- toggle de RA sem UI HTML
- posicionamento da arena em RA com hit-test, toque na superficie e ajuste de escala
- HUD de cartas com selecao, custo e regeneracao de cogumelos
- spawn de unidade ao tocar na arena apos selecionar a carta
- unidade Javali Raivoso andando ate a torre inimiga e causando dano
- torres com vida, contra-ataque e estado destruido

## Roadmap de Fases

| Concluida | Fase | Tarefa | Objetivo | Status |
| --- | --- | --- | --- | --- |
| [x] | 01 | Arena Anchor | Garantir que a arena $60cm \times 40cm$ fique travada na mesa sem tremer. | Concluída |
| [x] | 02 | Unit Spawner | Permitir selecionar uma carta e tocar na arena para instanciar uma unidade que anda para frente. | Concluida |
| [ ] | 03 | Shadows & Life | Adicionar ShadowGenerator para o cubo projetar sombra na arena e uma animacao simples de pular (squash and stretch) enquanto anda. | Nao iniciada |
| [ ] | 04 | Targeting | Fazer a unidade detectar a torre, parar de andar e comecar a atacar com feedback visual. | Parcialmente concluida |

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
