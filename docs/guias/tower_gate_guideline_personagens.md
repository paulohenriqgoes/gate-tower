# Tower Gate — Guideline de personagens

Versão 1, agosto de 2026. Documento de tratamento visual, não de conceito.

---

## 1. Princípio

**O conceito é livre. O tratamento é rígido.**

Qualquer criatura pode virar carta — javali raivoso, cururu bombado, dona barata, cabeça-de-TV, coelho de terno. O universo é de loucura declarada e a lista de cartas deve ser eclética de propósito, como o álbum de Greed Island. É a arbitrariedade que dá vontade de completar.

O que mantém tudo parecendo o mesmo jogo não é o assunto, é o tratamento. Sem as regras abaixo, cada geração de imagem volta com um estilo diferente e a arena vira sopa visual.

---

## 2. Tratamento base

**Brinquedo de vinil, acabamento mate, sem contorno.**

- Superfície fosca, nunca brilhante. Material brilhante entrega que o objeto é falso, porque a luz do ambiente real não bate com o reflexo renderizado.
- Sem contorno. A 8cm de altura sobre uma mesa bagunçada, contorno engorda a silhueta e briga com o fundo.
- Forma limpa e fechada. Volumes cheios, nada de partes finas ou soltas.
- Sem textura fotográfica. Cor sólida com sombreamento suave.

---

## 3. Regras de forma

| Regra | Valor |
|---|---|
| Proporção | 2 a 2,5 cabeças de altura |
| Altura no mundo real | 8 a 10cm |
| Base | Larga e estável, como brinquedo que fica em pé sozinho |
| Espessura mínima | Nada mais fino que ~3mm na escala real (patas, antenas, dedos) |
| Silhueta | Reconhecível vista de cima e de lado |
| Assimetria | Permitida e desejada, mas sutil |

O teste de silhueta: preencha o personagem de preto. Se você ainda sabe qual é, passou.

O teste de cima é específico do AR. O jogador olha a mesa de cima na maior parte do tempo. Um personagem desenhado só de frente desaparece nesse ângulo.

---

## 4. Cor

- 4 a 5 cores por criatura, no máximo.
- Uma cor dominante que identifica a carta à distância.
- Valor escuro na base, claro no topo. Ajuda a criatura a "assentar" na mesa.

**Evitar marrom, bege e branco puro como cor dominante.** Mesas são de madeira. Criatura marrom sobre mesa de madeira desaparece. Isso é uma restrição de AR, não estética.

---

## 5. Expressão

- Olhos grandes, o único veículo principal de expressão.
- Sobrancelhas fortes e legíveis — é delas que vem a personalidade nos seus desenhos.
- Boca simples, sem dentes detalhados.
- A personalidade vem da pose neutra, não da animação. Se o bicho só fica parado, ainda dá pra dizer o temperamento dele.

---

## 6. Nomenclatura

O padrão que já surgiu naturalmente e deve ser mantido: **título ou artigo + traço de personalidade.**

Dona Barata. Javali Raivoso. Cururu Bombado.

O nome carrega metade da caracterização. Isso é identidade brasileira e não é imitável por estúdio de fora. Nomes genéricos em inglês quebram o conjunto.

---

## 7. Chefes

Chefes podem e devem quebrar as regras de conceito — humanoides, vestidos, de outra ordem de realidade. O coelho de terno e o cabeça-de-TV pertencem aqui, não à tropa.

O que os chefes **não** podem quebrar: material mate, ausência de contorno, paleta limitada, teste de silhueta. Escala e proporção ficam livres.

---

## 8. Template de prompt para geração de imagem

Preencher os colchetes e manter o resto literal, para consistência entre gerações.

```
3D character concept, [CRIATURA], [TRAÇO DE PERSONALIDADE].
Designer vinyl toy style, matte finish, no outline, soft studio lighting.
Chibi proportions, 2.5 heads tall, large expressive eyes, strong eyebrows.
Simple closed forms, wide stable base, thick limbs.
Limited palette of 4 colors, dominant color [COR].
Neutral standing pose, three-quarter view, plain light gray background.
No text, no logo, no glossy highlights, no photorealistic texture.
```

Gerar sempre um segundo quadro do mesmo personagem visto de cima, para validar a leitura em AR.

---

## 9. Pipeline

1. Conceito escrito — criatura, traço, cor dominante, função na mecânica.
2. Imagem gerada com o template acima.
3. Teste de silhueta e teste de vista de cima antes de modelar.
4. Modelo 3D low poly.
5. Comportamento ocioso em código.

Na demo, assets low poly prontos são aceitáveis. O refinamento é incremental, carta por carta.

A sensação de vida vem do comportamento, não da animação: respiração sutil, cabeça acompanhando a câmera, passos curtos com pausa, olhar para outra criatura. Isso é código, não trabalho de animador.

---

## 10. Checklist de aprovação

Uma carta só entra no jogo se:

- [ ] Passa no teste de silhueta em preto
- [ ] É reconhecível visto de cima
- [ ] Nenhuma parte mais fina que 3mm na escala real
- [ ] Cor dominante não é marrom, bege nem branco
- [ ] Máximo 5 cores
- [ ] Material mate, sem brilho
- [ ] Fica em pé sozinho
- [ ] O nome segue o padrão título + traço
- [ ] Dá pra dizer o temperamento só olhando a pose parada
