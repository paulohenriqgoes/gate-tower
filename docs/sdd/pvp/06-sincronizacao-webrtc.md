# SDD 06 - Sincronizacao WebRTC

## Status

- Estado no repositorio: pendente.

## Objetivo

Trocar o transporte local fake pelo DataChannel WebRTC, mantendo o host como autoridade de comandos, eventos e resultado final.

## Problema que esta fase resolve

- A sessao PvP local valida a arquitetura, mas nao conecta dois aparelhos reais.

## Escopo

- Criar e configurar DataChannel.
- Enviar comandos do guest para o host.
- Enviar confirmacoes, rejeicoes e eventos do host para ambos os lados.
- Transportar pings e metadados minimos de conexao.

## Regras obrigatorias

- O host valida a ordem oficial de comandos.
- O guest nunca aplica um comando como definitivo antes da resposta do host.
- O canal principal de comandos deve ser confiavel e ordenado.
- O estado bruto nao deve ser transmitido a cada frame.

## Sugestao de modulos

- `src/pvp/webrtc/WebRtcTransport.ts`
- `src/pvp/webrtc/WebRtcChannelTypes.ts`
- `src/pvp/webrtc/LatencyProbe.ts`
- `src/pvp/webrtc/ConnectionStateStore.ts`

## Checklist de execucao

- [ ] Integrar a sessao PvP com um transporte WebRTC real.
- [ ] Criar canal confiavel para comandos e eventos.
- [ ] Propagar estado de conexao para UI.
- [ ] Garantir serializacao estavel de mensagens.
- [ ] Tratar timeout de resposta do host.
- [ ] Tratar desconexao durante partida.

## Criterios de aceite

- Dois aparelhos conseguem trocar comandos via WebRTC.
- O host aceita ou rejeita comandos do guest.
- Os dois lados observam o mesmo resultado final da partida.
- O build fecha sem erro.

## Validacao minima

- Teste em dois aparelhos reais na mesma rede.
- Teste de deploy remoto com reflexo coerente nos dois lados.
- Teste de desconexao no meio da partida.

## Fora de escopo

- Matchmaking online.
- Backend proprio.
