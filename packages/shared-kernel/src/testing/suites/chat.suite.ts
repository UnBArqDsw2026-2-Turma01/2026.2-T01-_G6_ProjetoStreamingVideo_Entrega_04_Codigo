import assert from 'node:assert/strict';
import type { ChatPort } from '../../ports';
import type { MensagemChat, MensagemDestacada, MensagemEntregue } from '../../tipos';
import { liveId, usuarioId } from '../../tipos';

export function casosChatPort(criarSut: () => ChatPort) {
  return [
    {
      nome: 'Deve publicar mensagem comum e notificar ouvintes da live',
      executar: async () => {
        const sut = criarSut();
        const idLive = liveId('live_1');

        const recebidas: MensagemEntregue[] = [];
        const cancelar = sut.inscrever(idLive, (m: MensagemEntregue) => recebidas.push(m));

        const mensagem: MensagemChat = {
          id: 'msg_1',
          autor: usuarioId('usr_1'),
          nomeAutor: 'Usuário 1',
          texto: 'Olá chat!',
          em: new Date(),
        };

        const publicacao = await sut.publicar(idLive, mensagem);
        assert.equal(publicacao.ok, true);

        assert.equal(recebidas.length, 1);
        assert.equal(recebidas[0].destacada, false);
        assert.equal(recebidas[0].mensagem.id, 'msg_1');

        cancelar();
      },
    },
    {
      nome: 'Deve publicar mensagem destacada corretamente',
      executar: async () => {
        const sut = criarSut();
        const idLive = liveId('live_1');

        const recebidas: MensagemEntregue[] = [];
        sut.inscrever(idLive, (m: MensagemEntregue) => recebidas.push(m));

        const mensagemDestacada: MensagemDestacada = {
          id: 'msg_2',
          autor: usuarioId('usr_2'),
          nomeAutor: 'Usuário 2',
          texto: 'Super chat!',
          em: new Date(),
          valor: 50,
          cor: '#FF0000',
          tempoFixacaoMin: 5,
        };

        const publicacao = await sut.publicarDestacada(idLive, mensagemDestacada);
        assert.equal(publicacao.ok, true);

        assert.equal(recebidas.length, 1);
        assert.equal(recebidas[0].destacada, true);
      },
    },
  ];
}