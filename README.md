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

| Concluida | Fase | Tarefa | Objetivo |
| --- | --- | --- | --- |
| [x] | 01 | POC | AR mode, Arena com escala, posicionar tropas |
| [0] | 02 | Inimigos | Bot inimigo para jogar contra. |
| [0] | 03 | Sons e Musica | Adicionar música de fundo e sons para ataques. |
| [0] | 04 | Tela inicial e Final game | Menu inicial para iniciar o game e final quando ganha/perde partida |

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
