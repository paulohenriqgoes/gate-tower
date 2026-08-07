# Coleta de evidencias (Fase 0 do encerrar-sessao)

## O que e / quando ler

Referencia da Fase 0 (COLETA) da skill `encerrar-sessao`: como reunir, antes de
escrever qualquer registro duravel (diario de experimento, progresso no
README), evidencia suficiente para que cada frase escrita tenha uma fonte —
leia isto no inicio da Fase 0, antes de tocar no diario ou no README.

## O caso que motivou este arquivo

Em `docs/experimentos/ra-e-paisagem.md`, a entrada do commit `ed93779` registrou
como conclusao "RA nao funciona em paisagem". Era verdade no teste feito, mas
falsa como explicacao: naquele momento nao existia gate de calibracao de escala
absoluta, entao o conteudo deslizava em qualquer orientacao — o experimento
estava medindo duas coisas ao mesmo tempo (paisagem x calibracao) e creditando
o resultado a uma so. A entrada do commit `49a8b44`, um dia depois, teve
que revogar a conclusao explicitamente (ver o aviso "Cuidado ao ler esta etapa"
em `docs/experimentos/ra-e-paisagem.md:57-63`). A conclusao nao estava errada
por descuido de escrita — estava errada porque generalizou de um resultado
observado (device travou nesse teste especifico) para uma causa nao verificada
(a orientacao e a causa). O trabalho da Fase 0 e forcar a pergunta "isso e o
que a evidencia mostra, ou e a explicacao mais provavel que eu inventei para
ela?" antes que a frase va para o diario.

## As fontes de evidencia, em ordem de confiabilidade

Da mais fraca a mais forte. Uma fonte fraca pode motivar uma frase no diario,
mas so com o nivel de certeza que ela de fato sustenta (ver tabela de
vocabulario abaixo).

1. **Saida de um agent dizendo "implementei X" / "corrigi Y".** Isto NAO e
   evidencia de que X funciona — e a afirmacao de intencao de quem escreveu o
   codigo, sujeita ao mesmo vies que gerou o bug em primeiro lugar. So vira
   evidencia depois de passar por uma das fontes abaixo. Nunca cite a palavra
   do agent como se fosse resultado.

2. **`git log` / `git diff` da sessao.** Prova o que mudou de fato no codigo —
   arquivos tocados, linhas adicionadas/removidas, mensagens de commit. Nao
   prova que a mudanca funciona, nem que resolve o problema que motivou a
   mudanca. Comando: `git log --oneline <inicio-sessao>..HEAD` e
   `git diff --stat <inicio-sessao>..HEAD`.

3. **`npx tsc --noEmit`.** Prova que o codigo tipa. Nao prova comportamento —
   codigo com tipos corretos pode fazer a coisa errada.

4. **`npm run test`.** Prova que os testes existentes (e os novos, se houver)
   passam. So vale para o que os testes cobrem; neste projeto os testes rodam
   em Node/jsdom e nao tocam SLAM, camera real ou sensores — logica pura como
   `arenaFraming.ts`, `hitTestSampling.ts`, `screenOrientation.ts` e testavel
   assim, comportamento de RA em device nao e.

5. **`npm run build`.** Prova que o projeto empacota para producao sem erro de
   build (diferente de `tsc --noEmit`, que so checa tipos). Nao prova
   comportamento em runtime, muito menos em RA.

6. **O que o usuario afirmou na conversa.** Prova a intencao por tras do pedido
   e, quando o usuario relata algo que viu, prova o resultado observado —
   mas so aquele resultado, no aparelho e nas condicoes em que foi observado.
   Ao registrar isto, separe explicitamente o que o usuario **viu** ("a arena
   nao deslizou depois de calibrar") do que o usuario **supos** ("deve ser
   porque o lock de orientacao ajudou") — a segunda parte e hipotese ate ser
   testada isoladamente, mesmo vindo do usuario.

7. **Teste manual em device pelo usuario.** A UNICA fonte que prova
   comportamento de RA. Por `docs/specs/README.md:54-56` (convencao
   obrigatoria 6): nada de RA pode ser validado no desktop, porque o SLAM so
   roda no celular. Nenhuma combinacao de `tsc`, `test` e `build` substitui
   isto para qualquer afirmacao sobre tracking, ancoragem, deslize, orientacao
   em RA ou calibracao — essas afirmacoes so entram como "confirmado" depois
   de teste real em aparelho.

## A pergunta de triagem

Para cada frase candidata a entrar no diario ou no progresso do README, faca
esta pergunta antes de escrever: **qual destas fontes sustenta isto?**

- Se a resposta for uma fonte concreta (commit, saida de `tsc`/`test`/`build`,
  relato de teste em device), cite essa fonte e escreva no nivel de certeza que
  ela sustenta — nunca mais alto.
- Se a resposta for "nenhuma, e o que parece mais provavel" ou "e o que o
  agent disse que fez", a frase **nao vai para "Provou"**. Vai para a secao
  "Hipoteses vivas" do diario, junto com o teste que decidiria a questao —
  seguindo o formato ja usado em `docs/experimentos/ra-e-paisagem.md:128-150`.
- Se a afirmacao e sobre comportamento de RA (tracking, deslize, ancoragem,
  orientacao durante sessao) e a unica fonte disponivel e `tsc`/`test`/`build`,
  a resposta e automaticamente "nenhuma fonte suficiente" — pare e pergunte ao
  usuario (ver roteiro abaixo) em vez de escrever a conclusao.

## Tabela de vocabulario

| Evidencia | Como escrever | Nunca escreva |
|---|---|---|
| agent disse que implementou, nada rodado ainda | "codigo escrito; nao verificado" | "implementado", "pronto", "funciona" |
| so compila (`tsc --noEmit` ok) | "compila; nao testado em device" | "funciona", "corrigido" |
| testes existentes passam (`npm run test`) | "logica testada (unit); nao testado em device" | "funciona em RA", "resolve o bug" |
| builda para producao (`npm run build`) | "builda sem erro; nao testado em device" | "pronto para uso" |
| usuario relatou o que viu no celular | "confirmado em device (<data>): <o que foi observado, literalmente>" | generalizar para alem do que foi observado |
| usuario especulou uma causa | vai para "Hipoteses vivas" com a especulacao atribuida ao usuario e o teste que a decide | tratar a especulacao como conclusao so por vir do usuario |
| suposicao do agent sobre por que algo funciona/falha | vai para "Hipoteses vivas" com o teste que a decide | "provou que", "a causa e" |
| dois fatores mudaram juntos e so um foi testado (caso `ed93779`) | registrar os dois fatores separadamente e marcar qual ficou nao testado | atribuir o resultado a um so fator |
| conclusao antiga contradita por evidencia nova | marcar a entrada antiga como **revogada**, com link para a entrada que revogou, e manter o texto original visivel | apagar ou reescrever a entrada antiga |

## Roteiro de coleta

Sequencia pratica que a Fase 0 executa, nesta ordem:

1. **Determinar o intervalo da sessao.**
   - `git log --oneline` para achar o ultimo commit anterior ao inicio da
     sessao atual (ou usar o horario da primeira mensagem da conversa como
     corte).
   - `git status --short` para o que esta sujo e ainda nao commitado.
   - `git diff --stat <ultimo-commit-anterior>..HEAD` (mais `git diff --stat`
     sem argumento, para o working tree) para o tamanho e a forma da mudanca.

2. **Listar arquivos tocados e agrupar por modulo.** Use os modulos
   obrigatorios de `.github/copilot-instructions.md:16-25`:
   - **AR Manager** — `src/ar/*` (`EighthWallARManager.ts`,
     `ArSessionController.ts`, `coachingOverlay.ts`, `hitTestSampling.ts`,
     `screenOrientation.ts` em `src/ui/`)
   - **Arena System** — limites de campo, lanes, colisao
   - **Unit Factory** — instanciacao de tropas/torres
   - **Combat Engine** — `src/combat/CombatEngine.ts`, estados
     Idle/Walk/Attack/Death
   - **HUD** — `src/ui/*` (`HudLayer.ts`, `CardDeckHud.ts`,
     `DiagnosticsOverlay.ts`, `StartScreen.ts`, etc.)

   Um arquivo que nao encaixa em nenhum modulo (`main.ts`, `docs/`,
   `scripts/`) fica numa categoria "infraestrutura/docs" a parte — nao force
   encaixe.

3. **Rodar as fontes automatizadas** (fontes 3, 4 e 5 da lista acima), se
   ainda nao rodaram nesta sessao: `npx tsc --noEmit`, `npm run test`,
   `npm run build`. Registrar passou/falhou — isto sustenta "compila" e "testes
   passam", nada alem disso.

4. **Varrer a conversa** por tres coisas, cada uma com o texto exato de onde
   veio (para nao parafrasear e perder o nivel de certeza original):
   - decisoes tomadas (e o motivo dado na hora, nao o motivo que parece melhor
     em retrospecto);
   - tentativas que falharam ou foram abandonadas (informacao tao valiosa
     quanto o que funcionou — evita repetir o caminho morto na proxima
     sessao, como a lista "Nao resolveu" em
     `docs/experimentos/ra-e-paisagem.md:52-55`);
   - qualquer resultado de teste em device relatado pelo usuario, junto com a
     data/momento em que foi relatado.

5. **Perguntar ao usuario o que nao da para inferir.** Nunca preencher isto
   com suposicao. Perguntas a fazer, literalmente, quando a sessao tocou RA,
   orientacao, calibracao, tracking ou ancoragem:
   - "Isto chegou a ser testado no celular? Em qual aparelho e navegador?"
   - "O que voce viu na tela — funcionou, ou apareceu algum problema? Descreva
     o que apareceu, nao so 'funcionou'/'nao funcionou'."
   - "Isso foi testado so em uma orientacao (retrato ou paisagem), ou nas
     duas?"
   - "Rodou uma sessao inteira sem girar o aparelho, ou chegou a trocar de
     orientacao no meio?"
   - "Existe algo que voce testou e decidiu nao mencionar porque achou que nao
     era importante?" (frequentemente e o dado que desfaz uma hipotese)

   Se a sessao nao tocou RA (mudanca so em HUD desktop, logica pura, docs),
   estas perguntas nao se aplicam — nao pergunte por perguntar.

## Armadilhas

- **Confundir "o agent disse que fez" com "esta feito".** A saida de um agent
  e um relato de intencao, nao um resultado observado — so vira fato depois de
  passar por `tsc`/`test`/`build`/device (ver fonte 1 acima).
- **Registrar a intencao do plano em vez do resultado.** Um spec dizendo o que
  deveria acontecer nao e evidencia de que aconteceu — so o diff, o teste ou o
  relato de device provam isso.
- **Apagar uma conclusao velha em vez de marca-la como revogada.** O valor do
  diario esta em mostrar o raciocinio errado e por que ele parecia certo na
  hora (ver o tratamento de `ed93779` por `49a8b44`) — apagar destroi esse
  valor e permite que a mesma suposicao falsa reapareca sem que ninguem
  reconheca o padrao.
- **Descrever o codigo em vez do aprendizado.** "Adicionei X em `arquivo.ts`"
  e changelog, e `git log` ja faz isso melhor e sem erro de transcricao. O
  diario existe para registrar o que a mudanca **provou ou nao provou** — a
  pergunta certa e "o que sabemos agora que nao sabiamos antes", nao "o que
  foi escrito".
- **Generalizar de um resultado observado para uma causa nao testada** — o
  proprio erro do caso `ed93779`: dois fatores mudaram juntos, so um foi
  testado isoladamente, e o resultado foi atribuido ao fator errado. Sempre que
  mais de uma coisa mudou entre "antes" e "depois" do teste, listar as duas e
  marcar qual ficou sem isolamento.
