# SDD 05 - Pareamento por QR

## Status

- Estado no repositorio: pendente.

## Objetivo

Criar o fluxo de pareamento local entre dois jogadores por QR Code, sem backend proprio.

## Problema que esta fase resolve

- Ainda nao existe um meio de trocar offer e answer entre aparelhos.
- O usuario precisa conseguir iniciar a conexao sem servidor da aplicacao.

## Escopo

- Criar a tela ou fluxo de criar sala.
- Gerar QR Code com payload inicial do host.
- Ler QR Code no guest.
- Permitir resposta com payload de retorno.
- Exibir estado da conexao e erros de pareamento.

## Decisoes abertas que devem ser fechadas nesta fase

- Se o fluxo inicial vai usar apenas QR ou QR + texto manual de fallback.
- Se a primeira versao vai depender de STUN publico ou apenas de mesma rede local.
- Como compactar payload para caber confortavelmente no QR.

## Sugestao de modulos

- `src/pvp/pairing/PairingPayload.ts`
- `src/pvp/pairing/QrCodeService.ts`
- `src/pvp/pairing/PairingFlowController.ts`
- `src/ui/pairing/PairingHud.ts`

## Checklist de execucao

- [ ] Definir formato de payload de offer.
- [ ] Definir formato de payload de answer.
- [ ] Criar serializacao e desserializacao compacta.
- [ ] Gerar QR Code para o host.
- [ ] Ler QR Code no guest.
- [ ] Criar fallback manual de copiar e colar payload.
- [ ] Expor status claros: aguardando, lido, respondido, conectado, falhou.

## Criterios de aceite

- O host consegue gerar um QR localmente.
- O guest consegue ler o QR e produzir a resposta.
- O fluxo fecha sem backend proprio.
- O usuario recebe feedback claro em caso de erro.

## Validacao minima

- Testar um fluxo completo host -> guest -> host com payload fake.
- Validar tamanho e legibilidade do QR em tela mobile.

## Fora de escopo

- Sincronizacao de partida em tempo real.
- Reconexao automatica apos desconectar.
