# Formato de diario de experimento

Este arquivo descreve a **estrutura e anatomia** dos diarios de experimento do projeto. Use-o quando precisar escrever uma entrada nova em um diario existente ou criar um diario do zero, sem precisar ler o diario inteiro como referencia.

Todos os diarios vivem em `docs/experimentos/<tema-kebab>.md`, com indice em `docs/experimentos/README.md`.

## Anatomia de um diario

Um diario de experimento guarda **duas** coisas: o resumo de cada sessao e o progresso de validacao das hipoteses. E a memoria do projeto sobre o que ja se sabe e como se soube. Sao tres secoes, e cada uma carrega uma tarefa especifica:

1. **Cabecalho + Objetivo**: Qual e a pergunta que o experimento e quer responder?
   - Titulo em `# Experimento: <descricao curta>`
   - Paragrafo explicativo: o que e este diario e por que importa
   - Uma linha "Ultima atualizacao: **AAAA-MM-DD**"
   - Secao "## Objetivo" detalhando o fim e as tensoes (o que puxa em direcoes opostas)

2. **Linha do tempo**: O que aconteceu e o que cada coisa provou?
   - Entradas numeradas por commit, ordenadas cronologicamente
   - Cada entrada registra **Feito** (a mudanca), **Provou** (o que aprendemos), e **Nao resolveu** (o que tentamos e falhou)
   - Quando uma conclusao foi superada depois, ela ganha um aviso "Cuidado ao ler" in loco, nao e apagada

3. **Hipoteses**: qual e o progresso de validacao?
   - Abre com uma **tabela de situacao**, para o progresso ser legivel de relance: `#`, a hipotese em uma linha, e o veredito — **VIVA**, **RESPONDIDA** ou **REFUTADA** — com a data de quando mudou
   - Depois, uma entrada por hipotese, ordenada por **suspeita** (mais provavel primeiro)
   - Cada uma inclui o **teste concreto** que a decide (como medir, quais numeros olhar, em qual condicao). Hipotese sem teste e opiniao
   - A numeracao e **estavel**: outros documentos citam hipoteses pelo numero, entao item novo entra no fim e diz onde fica na ordem de suspeita — nunca renumere

### O que NAO entra num diario

Tabela de "o que esta pronto", lista de "proximos passos", contrato, criterio de aceite, ordem de ondas, passo de execucao. Isso e **spec**, e mora no diretorio de specs do tema (para a v3: `docs/specs-arena-180/`).

O diario ja teve as duas coisas juntas, e elas divergiram: ele chegou a dizer "sem commit" para trabalho que estava em `066a5d7`. Uma entrada de diario responde *o que aprendemos*; uma spec responde *o que fazer*.

## Template de entrada na linha do tempo

Copie este bloco quando quiser adicionar uma entrada nova em um diario existente:

A skill `encerrar-sessao` roda **antes** do commit, entao normalmente o hash
ainda nao existe na hora de escrever. Nesse caso abra a entrada com
`### (sem commit) — <nome curto> (AAAA-MM-DD)` e troque pelo hash no proximo
encerramento, quando o `git log` ja tiver o commit. Nunca invente um hash.

```markdown
### `<commit-hash>` — <nome curto do que foi feito> (AAAA-MM-DD)

**Feito:** descrever a mudanca no codigo/setup. Pode incluir nomes de arquivos e funcoes.

**Provou:** descrever o que a mudanca ensinou. Isso e diferente de "Feito" — nao recapitular o que foi mudado, mas sim o que a mudanca revelou sobre o sistema. Pode ser varios paragrafos.

**Nao resolveu:** (quando aplicavel) listar as tentativas que o time tentou dentro desta entrada e que nao funcionaram. Suficiente detalhe para ninguem repetir o ciclo.

**Resultado em device:** (quando aplicavel) o que se viu na pratica quando testado num aparelho real.

**Cuidado ao ler esta etapa:** (quando aplicavel) avisar que uma conclusao anterior foi revogada depois, com ponteiro para a entrada que a revogou. Exemplo: "A conclusao registrada na epoca foi 'X nao funciona'. Ela envelheceu mal — ver <hash-posterior> abaixo. O que na verdade tinhamos era [a causa real que so foi descoberta depois]."
```

## Template de diario novo

Use este esqueleto quando criar um diario para um tema novo (quando a historia nao cabe num diario existente):

```markdown
# Experimento: <descricao do tema>

<Paragrafo 1-2 explicando o que este diario registra, por que o experimento importa, e qual e a forca ou confusao que motiva a investigacao. Termine com "Ultima atualizacao: **AAAA-MM-DD**".>

## Objetivo

<Paragrafo descrevendo o objetivo final do experimento — o que o time quer que funcione.>

<Paragrafo adicional, se aplicavel, explicando as tensoes: o que puxa em direcoes opostas e torna a coisa nao-obvia.>

## Linha do tempo

(comece a preencher com entradas conforme avanca o trabalho, usando o template acima)

## Hipoteses

<Uma frase dizendo que esta secao e o progresso de validacao do experimento.>

| # | Hipotese | Situacao |
|---|---|---|
| 1 | <hipotese em uma linha> | **VIVA** — <por que ainda nao se sabe> |
| 2 | <hipotese em uma linha> | **RESPONDIDA** (AAAA-MM-DD) — <a resposta, com o numero> |

<Depois, uma entrada por hipotese, ordenada por suspeita, cada uma com o teste que a decide.>
```

## Regras de escrita

1. **"Provou" e diferente de "Feito"**: "Feito" e o que foi mudado no codigo. "Provou" e o que a mudanca ensinou — o aprendizado. Uma entrada que tem "Feito" mas nao tem "Provou" e changelog, nao diario.

2. **"Nao resolveu" registra o caminho da busca**: Quando uma coisa nao funcionou, registre-a com detalhe suficiente para que ninguem repita o ciclo mais tarde. Exemplo: se tentou A e falhou, diga "tentamos A (esperavamos Y mas vimos Z) — isso nao resolveu porque [razao]".

3. **Conclusoes superadas nao sao apagadas**: Se uma conclusao de uma entrada foi desmentida depois por outra entrada, deixe-a intacta e adicione um aviso "**Cuidado ao ler esta etapa:**" no comeco da entrada, com o ponteiro para a entrada que revogou ela. Isso preserva o trail de aprendizado e evita confusao. Exemplo real do diario: a conclusao "RA nao funciona em paisagem" da entrada `ed93779` foi revogada pela entrada `49a8b44`; o diario marca isso in loco.

4. **Todo veredito datado carrega a data**: uma hipotese que mudou de situacao registra quando ("**RESPONDIDA** (2026-08-19)"). Isso deixa claro quando cada snapshot foi feito.

5. **Diario nao e spec**: se voce esta prestes a escrever um passo de execucao, um contrato, um criterio de aceite ou uma tabela de "o que esta pronto", pare — o destino e o diretorio de specs. O diario registra o que a sessao **provou**, nao o que a proxima deve fazer.

6. **Hipoteses sao ordenadas por suspeita, nao por ordem de descoberta**: A hipotese mais provavel vem primeiro. Cada uma inclui o teste concreto — numeros, dados ou passos — que a pode refutar. A numeracao e estavel: item novo entra no fim, nunca renumere.

7. **Lingua e sem acentos, no estilo do codigo**: Os docs deste projeto sao em portugues do Brasil, mas o texto nao leva acento. Isso mantem consistencia com a documentacao de referencia e facilita buscas.

## Onde o diario mora

- **Caminho canonico**: `docs/experimentos/<tema-kebab>.md`
- **Indice**: `docs/experimentos/README.md` com as colunas:
  ```
  | Tema | Arquivo | Status | Ultima atualizacao |
  ```
  onde Status e um de: `ativo`, `encerrado`, `revogado`
- **Nome do arquivo**: kebab-case, descritivo, sem sufixo de data
