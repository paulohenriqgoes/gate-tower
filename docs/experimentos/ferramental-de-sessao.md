# Experimento: ferramental de registro entre sessoes

Diario da tentativa de resolver um problema que nao e de codigo: **o registro do
projeto envelhece mal sozinho**. O `git log` guarda o que mudou, mas nao guarda o
que aquilo ensinou — e e o aprendizado que evita repagar um ciclo de
investigacao. Ultima atualizacao: **2026-08-06**.

## Objetivo

Que o fim de uma sessao produza registro duravel e honesto, de forma repetivel:
entrada de diario com o que foi provado, progresso no `README.md`, e revisao das
instrucoes permanentes (skills e memorias) que a sessao contradisse.

Duas exigencias que puxam em direcoes diferentes:

- o registro precisa ser **completo** — o que nao for escrito no fim da sessao se
  perde, porque a conversa nao sobrevive;
- o registro precisa ser **honesto** — e a tentacao no fim da sessao e escrever
  "funciona" sobre o que apenas compilou, justamente quando ninguem mais vai
  conferir.

O experimento e sobre encontrar o processo em que as duas coisas convivem.

## Linha do tempo

### (sem commit) — skill `encerrar-sessao` e diarios por tema (2026-08-06)

**Feito:**

- `docs/experimento-ra-landscape.md` movido para `docs/experimentos/ra-e-paisagem.md`,
  estabelecendo `docs/experimentos/<tema-kebab>.md` como caminho canonico. As 4
  referencias ao caminho antigo foram corrigidas (`README.md` x2,
  `src/main.ts:265`, `src/ui/screenOrientation.ts:9`).
- `docs/experimentos/README.md` novo: indice com `Tema | Arquivo | Status |
  Ultima atualizacao`, onde `Status` e `ativo`, `encerrado` ou `revogado`.
- Skill `encerrar-sessao` (`.claude/skills/encerrar-sessao/`), com procedimento em
  6 fases (coleta, classificacao, diario, README, revisao de skills/memoria,
  fechamento), 4 regras invioláveis e 3 arquivos de referencia carregados sob
  demanda: `coleta-de-evidencias.md`, `formato-diario.md` e
  `revisao-de-skills-e-memoria.md`.
- `AGENTS.md` ganhou a secao "Ao encerrar", espelhando "Ao planejar".

**Provou:**

1. **A varredura de contradicao pega coisa real na primeira execucao.** Na
   estreia da Fase 4, a memoria `landscape-ar-incompativel` foi encontrada
   afirmando que "o modo RA fica quebrado demais em landscape" — conclusao que o
   proprio `ra-e-paisagem.md` ja marcava como **revogada** na entrada `49a8b44`
   (paisagem destravada roda bem; o que quebra e trocar de orientacao com a
   sessao no ar). A contradicao existia ha dias em dois arquivos do mesmo repo e
   ninguem tinha visto, porque ninguem reabre memoria antiga sem motivo. Isso
   sustenta a hipotese que motivou a skill: informacao nova existir em algum
   lugar do repo nao basta — ela precisa **chegar** ao registro permanente, ou o
   registro permanente mente por omissao.
2. **Rodar a skill sobre a propria sessao que a criou revelou um defeito de
   contrato.** O template de entrada da linha do tempo pressupoe um hash de
   commit, mas a skill roda **antes** do commit (regra 4: nao commite) — o hash
   nao existe na hora de escrever. Corrigido no mesmo passo: entradas sem commit
   abrem com `(sem commit)` e recebem o hash no encerramento seguinte. Um teste
   de mesa nao teria achado isso; so aparece executando.

**Nao resolveu:** nada foi tentado e descartado nesta entrada — a estrutura foi
escrita direto no formato acordado.

**Resultado em device:** nao se aplica. Nenhuma mudanca de comportamento do jogo.
As duas alteracoes em `src/` sao comentarios de caminho de documentacao;
`npx tsc --noEmit` passa. Nenhum modulo de jogo (AR Manager, Arena System, Unit
Factory, Combat Engine, HUD) foi tocado.

## Estado atual (2026-08-06)

| | Situacao |
|---|---|
| Skill `encerrar-sessao` acionavel | Sim — registrada e carregada nesta sessao |
| Diarios por tema + indice | Em uso (`ra-e-paisagem`, `ferramental-de-sessao`) |
| Fase 4 (revisao de skills/memoria) | Exercitada uma vez, achou 1 contradicao real |
| Skill exercitada em sessao de **codigo** | **Nao** — esta sessao so produziu ferramental |
| Formato de entrada sem hash de commit | Resolvido (`(sem commit)`) |

## Hipoteses vivas

Em ordem de suspeita, com o teste que decide cada uma:

1. **A Fase 0 vai ser fraca em sessao longa de codigo.** Aqui a coleta foi
   trivial: a sessao inteira coube num `git status` e nada foi testado em device.
   Numa sessao de gameplay ou RA, a evidencia esta espalhada entre conversa,
   diff e teste manual, e a parte que mais importa (o que foi testado no celular)
   so existe na memoria do usuario. **Teste:** rodar a skill no fim da proxima
   sessao que mexer em RA ou combate e verificar se a entrada gerada distingue
   corretamente "compila" de "confirmado em device", sem que o usuario precise
   corrigir o texto.
2. **A regra "nada de funciona sem device" pode ser contornada por descuido.**
   Ela e uma instrucao, nao um mecanismo — nada impede uma redacao otimista.
   **Teste:** na proxima entrada sobre RA, conferir se cada afirmacao de
   comportamento tem ponteiro para um teste real declarado pelo usuario.
3. **O indice pode divergir dos diarios.** `Status` e `Ultima atualizacao` sao
   mantidos a mao, em arquivo separado do diario. **Teste:** depois de dois ou
   tres encerramentos, conferir se as datas do indice batem com o cabecalho de
   cada diario.

## Proximos passos

1. **Exercitar a skill numa sessao de codigo de verdade** — e o unico teste que
   decide a hipotese 1, e nenhuma revisao de mesa substitui.
2. **Decidir o destino da memoria `landscape-ar-incompativel`** (proposta
   pendente de aprovacao do usuario): corrigir a conclusao revogada e apontar
   para a entrada `49a8b44` deste repo.
3. **Corrigir o comentario falso em `src/ui/screenOrientation.ts`** — dentro de
   `installImmersiveModeOnGesture` ele afirma que o engine le a orientacao "UMA
   vez ao iniciar a sessao"; a investigacao do bundle mostrou que a orientacao e
   recalculada **por frame**. E trabalho de codigo, fora do escopo de um
   encerramento, mas fica registrado para nao se perder.
4. **Trocar `(sem commit)` pelo hash real** na entrada acima, no proximo
   encerramento.
