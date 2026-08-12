# Tower Gate — Game Flow

Documento de design consolidado. Versão 1, agosto de 2026.

---

## 1. Pilar central

O jogador precisa sentir que **um mundo vivo apareceu no lugar onde ele está** e querer contar isso para alguém.

Ordem de prioridade das sensações, definida pelo game designer:

1. Criaturas com vida própria — agem sozinhas, sem comando.
2. Movimento físico — se aproximar, se abaixar, contornar.
3. O portal abrindo no mundo real.
4. Reação ao ambiente físico.

Toda decisão abaixo é derivada dessa ordem. Quando houver conflito entre clareza competitiva e sensação de mundo vivo, a sensação ganha.

---

## 2. Formato

| Decisão | Valor | Razão |
|---|---|---|
| Orientação | Retrato | Uma mão livre, gesto de apontar o celular pro chão, espaço vertical para ver a criatura de baixo. Landscape é incompatível com o 8th Wall e com os pilares. |
| Escala | Mesa, ~80cm | Derivada do tamanho mínimo da criatura (8–10cm) para que a animação ociosa seja legível. |
| Escala alternativa | Sala, ~2m | Variante futura. Sem valores intermediários, sem slider. |
| Torres | Uma de cada lado | Três torres é estado demais para rastrear em AR. Resultado inequívoco. |
| Duração | 3 minutos | Impede empate defensivo. Também limita aquecimento e cansaço do braço. |
| Desempate | Percentual de HP da torre | No último minuto, cogumelos crescem em dobro para forçar resolução. |
| Cartas na mão | 4 | Zona do polegar, terço inferior da tela. |

A escala não é escolhida em menu. Durante a invocação o jogo mede a extensão do plano detectado e encaixa o maior preset que cabe. Se o plano for pequeno, apenas mesa é oferecida e o jogador não sabe que existia outra opção.

Com uma torre só, a arena tem um caminho central único. Não há lanes.

---

## 3. Loop de sessão

### Beat 1 — Álbum
Tela inicial é a coleção, não um menu. O jogador abre o jogo e vê o que falta.

### Beat 2 — Escolher o portão
Cada portão mostra qual carta a IA usa. A recompensa é aquilo que te machucou na partida anterior.

### Beat 3 — Invocação
O jogador aponta o celular para a mesa. Detecção de plano, escolha automática do preset, o portão abre.
A calibração do 8th Wall é apresentada como ritual, não como tela técnica.

### Beat 4 — Chegada
A arena brota. **Sem HUD nenhum.** Só o mundo e as criaturas ociosas.
Este beat é o que entrega o pilar. Comportamento ocioso obrigatório: criaturas param, olham para o jogador, interagem entre si.

### Beat 5 — Desafio
O jogador se aproxima da torre inimiga e a acorda. Ele decide quando começar — não há timer de espera.

O gesto de acordar precisa **entregar informação**, senão vira tarefa:
- O inimigo se levanta, olha para o jogador e revela uma das cartas que vai usar.
- Portões marcantes têm um chefe com personalidade e provocação própria.
- Portões comuns: a própria torre reage, sem chefe.
- A partir da segunda visita ao mesmo portão, um toque basta. O ritual completo é só na estreia.

### Beat 6 — Batalha
HUD mínimo: cogumelos, 4 cartas, HP das torres.

Invocação em dois toques:
1. Toque na carta → a metade da arena do jogador acende, mostrando a zona válida.
2. Toque no chão → a criatura aparece como fantasma por uma fração de segundo, depois materializa.

Toque fora da zona não gasta cogumelo, apenas cancela.

**A batalha nunca pausa.** Um mundo vivo não espera. Se o jogador se aproxima e perde parte da arena de vista, o HUD garante o essencial: HP sempre visível e indicador direcional quando algo importante acontece fora de quadro.

Isso cria a tensão desejada: chegar perto para se encantar custa informação tática.

### Beat 7 — Fim
A arena se desfaz devagar. Não há corte para tela de resultado.
Momento de "quem voltou": as criaturas sobreviventes retornam ao estoque.

### Beat 8 — Recompensa
A figurinha cai no chão real. O jogador precisa se abaixar para pegar.
Este beat existe para devolver o corpo à experiência, contra a tendência do HUD de prender o olho na tela.

### Beat 9 — Volta ao álbum
A figurinha cola sozinha. O jogador vê o buraco que ainda falta.

O álbum nunca aparece durante os beats 3 a 7.

---

## 4. Economia de cartas

### Duas camadas

- **Registro** — a figurinha entra no álbum e fica para sempre. É o que conta para as 99.
- **Cópias** — o estoque consumível daquela carta. Gastar cópias nunca apaga o registro.

Isso impede que colecionar e gastar briguem entre si. O álbum mede descoberta, o estoque mede economia.

### Consumo

Cartas são consumidas ao invocar, mas **apenas as criaturas que morrem são perdidas**. As que sobrevivem ao fim da partida voltam ao estoque.

Consequências desejadas:
- Cada invocação tem peso.
- O jogador cria vínculo com a criatura que sobreviveu a várias partidas.
- Jogar bem custa menos: habilidade vira economia.
- Some o medo de usar a carta boa, porque usá-la bem é como se preserva.

### Recompensas

| Resultado | Loot |
|---|---|
| Torre derrubada | Cheio — o jogador cresce |
| Vitória por HP no tempo | Reduzido — sobreviveu, não avançou |
| Derrota | Nada além do prejuízo das criaturas mortas |

Quem não ataca não progride.

### Piso de falência

Quando o estoque zera, o jogador rola os **dados da sorte** e recebe cartas básicas para voltar aos portões baixos.
Deve ser diegético, não uma tela de sistema. Sugestão: um cogumelo estranho que o jogador come.

Os portões baixos precisam devolver mais do que custam, para que a recuperação seja rápida e não humilhante.

---

## 5. Progressão

Portões numerados. Cada portão define o nível da IA.

Níveis mais altos usam cartas mais fortes, que custam mais cogumelo para invocar. O custo é o freio econômico: ganhar uma carta rara muda o ritmo de invocação do jogador, não quebra o jogo.

A IA funciona como catálogo vivo — o jogador enfrenta um portão porque quer a carta que ele usa.

Chefes aparecem apenas em portões marcantes, servindo como marco de progressão sem custar arte em todos os níveis.

Meta final: completar 99 figurinhas libera a centésima e o grande evento.

---

## 6. Pontos em aberto

- Quantidade de portões até o primeiro chefe.
- Curva de custo em cogumelo por raridade.
- Tamanho do estoque inicial e o que os dados da sorte entregam exatamente.
- Regra de dano da torre quando a partida termina no tempo (percentual exato de desempate).
- Comportamento ocioso: repertório mínimo de animações por criatura.
- Como o multiplayer presencial se encaixa neste flow (meta declarada, fora do escopo desta versão).
- Layout definitivo do HUD em retrato, incluindo indicador direcional de eventos fora de quadro.
