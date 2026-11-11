import assert from 'node:assert/strict';
import type { TransmissaoPort } from '../../ports';
import type { PresetTransmissao, Sessao } from '../../tipos';
import { liveId, usuarioId } from '../../tipos';

export function casosTransmissaoPort(criarSut: () => TransmissaoPort) {
  return [
    {
      nome: 'Deve falhar ao consultar uma live inexistente ou encerrada',
      executar: async () => {
        const sut = criarSut();
        const resultado = await sut.consultar(liveId('live_invalida'));

        assert.equal(resultado.ok, false);
      },
    },
    {
      nome: 'Deve abrir uma live e conseguir consultá-la em seguida',
      executar: async () => {
        const sut = criarSut();
        const criadorMock: Sessao = {
          usuarioId: usuarioId('usr_1'),
          papel: 'criador',
          token: 'token_teste',
          expiraEm: new Date(),
        };
        const presetMock: PresetTransmissao = {
          preset: 'baixa-latencia',
          titulo: 'Live Teste',
        };

        const abertura = await sut.abrir(criadorMock, presetMock);
        assert.equal(abertura.ok, true);

        if (abertura.ok) {
          const consulta = await sut.consultar(abertura.valor.live);
          assert.equal(consulta.ok, true);
          if (consulta.ok) {
            assert.equal(consulta.valor.criador, 'usr_1');
          }
        }
      },
    },
  ];
}