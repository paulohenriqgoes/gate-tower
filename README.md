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
- modo RA migrado de WebXR para o engine 8th Wall (SLAM via camera), com suporte a iOS

## Realidade Aumentada (8th Wall)

- O modo RA usa o engine 8th Wall (`@8thwall/engine-binary`), que roda em qualquer navegador mobile (iOS Safari incluido) — WebXR nao e mais utilizado.
- Os artefatos do engine sao copiados de `node_modules` para `public/8thwall/` automaticamente no `npm install` (script `postinstall`).
- O chao estimado pelo SLAM fica no plano `y = 0`; a arena e posicionada por raycast com toque na superficie, com ajuste de escala (mundo em metros, escala absoluta).
- O binario possui licenca de uso limitado (ver `node_modules/@8thwall/engine-binary/LICENSE`).

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

O dev server roda em HTTPS (certificado autoassinado) porque o acesso a camera exige contexto seguro. Para testar no celular, acesse `https://<ip-da-maquina>:5173` na mesma rede e aceite o aviso de certificado.

- Build de produção:

```bash
npm run build
```
