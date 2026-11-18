import assert from 'node:assert/strict';
import type { ModeracaoPort } from '../../ports';
import type { MensagemChat } from '../../tipos';
import { usuarioId } from '../../tipos';

export function casosModeracaoPort(criarSut: () => ModeracaoPort) {
  return [
    {
      nome: 'Deve aprovar mensagem limpa',
      executar: async () => {
        const sut = criarSut();
        const mensagemLimpa: MensagemChat = {
          id: 'msg_1',
          autor: usuarioId('usr_1'),
          nomeAutor: 'A',
          texto: 'Tudo bem?',
          em: new Date(),
        };

        const veredito = await sut.avaliar(mensagemLimpa);
        assert.equal(veredito.decisao, 'aprovada');
      },
    },
    {
      nome: 'Deve bloquear mensagem com ofensa',
      executar: async () => {
        const sut = criarSut();
        const mensagemOfensiva: MensagemChat = {
          id: 'msg_1',
          autor: usuarioId('usr_1'),
          nomeAutor: 'A',
          texto: 'Seu palavrão',
          em: new Date(),
        };

        const veredito = await sut.avaliar(mensagemOfensiva);
        assert.equal(veredito.decisao, 'bloqueada');
      },
    },
    {
      nome: 'Deve mandar para quarentena mensagem com link suspeito',
      executar: async () => {
        const sut = criarSut();
        const mensagemSuspeita: MensagemChat = {
          id: 'msg_1',
          autor: usuarioId('usr_1'),
          nomeAutor: 'A',
          texto: 'Acesse http://spam.com',
          em: new Date(),
        };

        const veredito = await sut.avaliar(mensagemSuspeita);
        assert.equal(veredito.decisao, 'quarentena');
      },
    },
  ];
}