# SDD 02 - Modelo autoritativo local

## Status

- Estado no repositorio: pendente.

## Objetivo

Criar a camada de sessao PvP com host autoritativo, protocolo de comandos e eventos, e um transporte local em memoria para validar a arquitetura antes do WebRTC.

## Problema que esta fase resolve

- O `CombatEngine` ainda mistura combate com captura de input local.
- Nao existe um contrato formal de comando, evento, snapshot ou resultado.
- Ainda nao ha um log autoritativo do que o host aceitou ou rejeitou.

## Escopo

- Definir tipos de sessao, papeis e estados da partida.
- Definir comandos canonicamente serializaveis.
- Definir eventos autoritativos emitidos pelo host.
- Criar um transporte local em memoria para host e guest.
- Separar entrada local da regra de combate.

## Contratos minimos esperados

- `PlayerRole`: `host` ou `guest`.
- `PlayerSeat`: `bottom` ou `top`.
- `MatchCommand`: pelo menos `deploy-card`.
- `MatchEvent`: pelo menos `match-started`, `command-accepted`, `command-rejected`, `match-ended`.
- `MatchSnapshot`: estado resumido para reconciliacao futura.
- `MatchResult`: vencedor, derrotado e motivo.

## Sugestao de modulos

- `src/pvp/PvpTypes.ts`
- `src/pvp/PvpSessionState.ts`
- `src/pvp/PvpCommandLog.ts`
- `src/pvp/PvpEventLog.ts`
- `src/pvp/LocalPeerTransport.ts`
- `src/pvp/HostMatchSession.ts`
- `src/pvp/GuestMatchSession.ts`
- `src/pvp/MatchOrchestrator.ts`

## Integracoes esperadas

- `CombatEngine` deve parar de ouvir clique direto como fonte final de deploy.
- A UI local deve emitir uma intencao de comando, nao spawnar por conta propria.
- O host valida o comando e so entao o combate aplica o spawn.

## Checklist de execucao

- [ ] Criar tipagem compartilhada de protocolo PvP.
- [ ] Criar IDs estaveis para comandos, eventos e sessao.
- [ ] Criar log ordenado de comandos recebidos e decisao do host.
- [ ] Criar log ordenado de eventos autoritativos.
- [ ] Implementar transporte local em memoria com dois peers.
- [ ] Implementar sessao host com validacao de comandos.
- [ ] Implementar sessao guest que envia intencoes e consome eventos do host.
- [ ] Adaptar o app para subir no modo local host + guest fake.

## Criterios de aceite

- O host recebe, valida e responde a um comando `deploy-card`.
- O guest nao altera o estado sozinho; ele apenas envia intencoes.
- Existe trilha audivel de comandos aceitos e rejeitados.
- O combate continua modular e sem dependencia direta do transporte.
- O build fecha sem erro.

## Validacao minima

- Rodar `npm run build`.
- Simular localmente um deploy do host e um deploy do guest via transporte em memoria.
- Confirmar que apenas comandos aceitos entram no combate.

## Fora de escopo

- WebRTC real.
- QR Code.
- Perspectiva invertida por jogador.
- Reconciliacao por snapshot.
