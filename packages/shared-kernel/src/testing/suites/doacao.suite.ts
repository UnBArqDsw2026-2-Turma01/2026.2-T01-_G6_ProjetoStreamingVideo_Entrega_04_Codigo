import assert from 'node:assert/strict';
import type { DoacaoPort } from '../../ports';
import type { MoedaVirtual, Sessao } from '../../tipos';
import { liveId, usuarioId } from '../../tipos';

export function casosDoacaoPort(criarSut: () => DoacaoPort) {
  return [
    {
      nome: 'Deve falhar doação com valor zero ou negativo',
      executar: async () => {
        const sut = criarSut();
        const sessao: Sessao = { usuarioId: usuarioId('usr_1'), papel: 'espectador', token: 'a', expiraEm: new Date() };
        const idLive = liveId('live_1');
        const valorZero: MoedaVirtual = 0;

        const resultado = await sut.doar(sessao, idLive, valorZero);
        assert.equal(resultado.ok, false);
      },
    },
    {
      nome: 'Deve realizar doação com sucesso e retornar comprovante',
      executar: async () => {
        const sut = criarSut();
        const sessao: Sessao = { usuarioId: usuarioId('usr_1'), papel: 'espectador', token: 'a', expiraEm: new Date() };
        const idLive = liveId('live_1');
        const valorPositivo: MoedaVirtual = 50;

        const resultado = await sut.doar(sessao, idLive, valorPositivo, 'Mensagem de teste');

        assert.equal(resultado.ok, true);
        if (resultado.ok) {
          assert.equal(resultado.valor.valor, valorPositivo);
          assert.equal(resultado.valor.live, idLive);
          assert.equal(resultado.valor.doador, sessao.usuarioId);
        }
      },
    },
  ];
}