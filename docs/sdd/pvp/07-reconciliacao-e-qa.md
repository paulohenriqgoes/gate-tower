# SDD 07 - Reconciliacao e QA

## Status

- Estado no repositorio: pendente.

## Objetivo

Adicionar snapshots periodicos, mecanismos de correcao de desvio e o pacote final de validacao para declarar o PvP pronto.

## Problema que esta fase resolve

- Mesmo com simulacao deterministica, pequenas diferencas de processamento ou perda de mensagens podem gerar desvio.

## Escopo

- Definir formato minimo de snapshot autoritativo.
- Enviar snapshots periodicos do host.
- Detectar divergencia no cliente.
- Corrigir desvio sem quebrar a leitura da partida.
- Fechar checklist de QA funcional e de rede.

## Regras obrigatorias

- Snapshot serve para reconciliacao, nao para substituir o fluxo de comandos.
- A correcao deve priorizar clareza visual e consistencia final.
- Vitoria ou derrota precisam ser identicas nos dois lados.

## Sugestao de modulos

- `src/pvp/reconciliation/MatchSnapshot.ts`
- `src/pvp/reconciliation/SnapshotComparator.ts`
- `src/pvp/reconciliation/SnapshotApplier.ts`
- `src/pvp/reconciliation/DriftMonitor.ts`

## Checklist de execucao

- [ ] Definir snapshot minimo: tick, torres, mana, unidades e resultado se houver.
- [ ] Criar politica de envio periodico.
- [ ] Comparar snapshot local com snapshot do host.
- [ ] Aplicar correcao quando o desvio passar do limite tolerado.
- [ ] Criar indicadores de drift para depuracao.
- [ ] Fechar script manual de QA em dois dispositivos.

## Criterios de aceite

- Pequenas variacoes de latencia nao causam divergencia visivel grave.
- O cliente consegue se reconciliar com o host apos pequeno desvio.
- Ambos os jogadores recebem o mesmo resultado final.
- O build fecha sem erro.

## Validacao minima

- Simular latencia e pequenas falhas de entrega.
- Testar final de partida nos dois aparelhos.
- Testar destruicao de torres, esgotamento de tropas e encerramento da sessao.

## Checklist final de QA

- [ ] Criar sala.
- [ ] Entrar na sala por QR.
- [ ] Concluir handshake.
- [ ] Invocar carta no host.
- [ ] Invocar carta no guest.
- [ ] Ver dano, mana e destruicao de torres coerentes.
- [ ] Encerrar partida com mesmo vencedor.
