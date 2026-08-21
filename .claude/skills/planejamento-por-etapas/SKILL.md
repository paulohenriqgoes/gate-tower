---
name: planejamento-por-etapas
description: Formato obrigatório de planejamento deste projeto (Tower Gate). Todo plano deve ser quebrado em etapas, cada etapa com spec própria, com sub-agents declarados por tarefa, com o modelo mais adequado escolhido para cada um (modelos simples para tarefas de rotina, modelos fortes só onde há decisão de arquitetura) e com paralelismo explícito quando as tarefas forem independentes. Use SEMPRE que for planejar, propor abordagem, quebrar trabalho, entrar em plan mode, responder "como você faria", "qual o plano", "planeja aí", "monta um roadmap", "por onde começar", ou antes de iniciar qualquer implementação que toque mais de um arquivo ou mais de um módulo (AR Manager, Arena System, Unit Factory, Combat Engine, HUD). Não é necessária para pergunta pontual, leitura de código ou correção de uma linha.
---

# Planejamento por Etapas — Tower Gate

Todo plano deste projeto segue o formato abaixo. Um plano que não tenha **spec por etapa**, **sub-agents declarados com modelo** e **decisão explícita de paralelismo** está incompleto — refaça antes de apresentar ao usuário.

Antes de planejar, respeite o que já é obrigatório no repositório: `.github/copilot-instructions.md` (arquitetura modular, SOLID, performance mobile) e `README.md` (estado atual e roadmap). Para qualquer etapa que toque Babylon.js ou RA/8th Wall, acione também a skill `babylonjs-game-dev`.

## 1. Estrutura obrigatória do plano

O plano é uma lista ordenada de **etapas**. Cada etapa é uma unidade entregável e verificável — se não dá para validar sozinha, ela não é uma etapa, é parte de outra.

Cada etapa carrega a sua **spec**, nesta forma:

```markdown
### Etapa N — <nome curto>

**Objetivo:** o que passa a existir/funcionar depois desta etapa (1–2 frases).
**Arquivos-alvo:** caminhos concretos que serão criados ou alterados.
**Contrato:** assinaturas, tipos, eventos ou interfaces que esta etapa expõe para as
outras. É o que permite que etapas paralelas não se atropelem.
**Critério de aceite:** condição observável de "pronto" (comportamento no jogo,
build passando, log esperado, FPS mantido).
**Como validar:** o comando ou o teste manual no device — `npm run build`,
`npm run dev` + toque na arena, etc.
**Fora de escopo:** o que esta etapa deliberadamente NÃO faz (evita que o
sub-agent invente trabalho).
**Sub-agents:** tabela do item 2.
**Depende de:** etapas anteriores, ou "nenhuma" (candidata a paralelismo).
```

## 2. Sub-agents por etapa

Toda etapa declara como será executada, mesmo quando a resposta for "sem sub-agent — execução direta". A declaração usa esta tabela:

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|

- **Agent**: um dos tipos disponíveis (`Explore` para varredura read-only, `Plan` para desenho de solução, `general-purpose` para tarefas multi-passo com escrita, `claude` como catch-all).
- **Modelo**: escolhido pela regra do item 3 — nunca deixe em branco, nunca use o padrão por omissão.
- **Paralelismo**: o nome das outras tarefas que disparam junto, ou "—".

Regras:

- Tarefa de leitura/investigação ampla (achar onde algo está, mapear usos, conferir convenção) **sempre** vira sub-agent — ela consome contexto que não precisa voltar inteiro.
- Tarefa que escreve código em arquivos que outra tarefa também escreve **nunca** é paralela. Serialize ou reparticione por arquivo.
- Se a etapa é uma edição pequena e localizada, o correto é declarar "execução direta, sem sub-agent". Sub-agent tem custo de partida a frio: ele não herda o contexto da conversa e precisa redescobrir tudo.

## 3. Escolha de modelo por tarefa

O critério é a **natureza da decisão**, não o tamanho do arquivo. Escale para cima só quando a tarefa exigir julgamento que não está escrito em lugar nenhum.

| Modelo | Use quando | Exemplos neste projeto |
|---|---|---|
| `haiku` | Tarefa mecânica de rotina, com resposta verificável e critério já definido. O caminho barato e rápido — prefira-o por padrão nessas tarefas. | Renomear símbolo em vários arquivos; achar onde uma constante é usada; conferir se o build passa; ajustar texto de HUD; atualizar tabela do README; extrair lista de imports. |
| `sonnet` | Implementação normal dentro de um contrato já definido pela spec. É o padrão para "escrever o código da etapa". | Implementar um estado novo na State Machine de unidade; adicionar carta ao HUD seguindo o padrão existente; escrever a lógica de contra-ataque de torre; ajustar reenquadramento de câmera por aspect ratio. |
| `opus` | Decisão de arquitetura, trade-off sem resposta óbvia, depuração de causa-raiz, ou trabalho que cruza módulos e pode contaminar o resto do projeto. | Desenhar a ancoragem da arena em RA; investigar drift/jitter no SLAM; decidir como o Combat Engine fica independente do modo de renderização; diagnosticar queda de FPS em mobile. |

Na dúvida entre dois níveis: se a tarefa tem **critério de aceite objetivo e contrato fechado**, desça um nível; se o erro dela só apareceria depois, em outro módulo, suba um nível.

O plano deve dizer **por que** cada modelo foi escolhido quando a escolha não for óbvia — uma cláusula curta basta ("mecânico, contrato fechado → haiku").

## 4. Paralelismo

Todo plano é obrigado a responder: **o que pode rodar junto?**

1. Monte o grafo de dependências das etapas (o campo "Depende de").
2. Agrupe em **ondas**: etapas sem dependência pendente entram na mesma onda.
3. Dentro de uma onda, dispare os sub-agents independentes **na mesma mensagem** — chamadas independentes do Agent no mesmo bloco rodam em paralelo. Chamadas em mensagens separadas são sequenciais e desperdiçam o ganho.
4. Bloqueie o paralelismo quando houver: escrita no mesmo arquivo, dependência de contrato ainda não escrito, ou necessidade de testar no device (validação em hardware é serial por natureza).

Apresente o resultado como um bloco curto:

```
Onda 1 (paralelo): Etapa 1 · Etapa 3
Onda 2 (após 1):   Etapa 2
Onda 3 (serial):   Etapa 4 — valida no device
```

Se nada puder rodar em paralelo, diga isso e o motivo. Um plano totalmente serial é aceitável; um plano serial **sem justificativa** não é.

## 5. Checklist antes de entregar o plano

- [ ] Cada etapa tem spec completa (objetivo, arquivos, contrato, aceite, validação, fora de escopo).
- [ ] Cada etapa declara sub-agents — ou declara explicitamente "execução direta".
- [ ] Cada sub-agent tem modelo escolhido, com tarefas de rotina em `haiku` e `opus` reservado a decisão real.
- [ ] Existe o bloco de ondas, com paralelismo justificado.
- [ ] Nenhuma onda paralela tem duas tarefas escrevendo no mesmo arquivo.
- [ ] Etapas que tocam RA/Babylon acionam `babylonjs-game-dev`.
- [ ] Etapa que liga mais de um módulo diz **como a fiação será testada**: teste puro cobre a regra, `NullEngine` cobre a ligação (ver `babylonjs-game-dev/references/testing-nullengine.md`), device cobre percepção. "Valida no device" sozinho, para algo que roda headless, é planejamento caro.
- [ ] O plano respeita a arquitetura modular obrigatória do `.github/copilot-instructions.md`.
