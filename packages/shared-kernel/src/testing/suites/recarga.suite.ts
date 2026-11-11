import assert from 'node:assert/strict';
import type { RecargaPort } from '../../ports';
import type { MeioPagamento, Sessao } from '../../tipos';
import { pacoteId, usuarioId } from '../../tipos';

export function casosRecargaPort(criarSut: () => RecargaPort) {
  return [
    {
      nome: 'Deve falhar ao tentar recarregar pacote inválido',
      executar: async () => {
        const sut = criarSut();
        const sessao: Sessao = { usuarioId: usuarioId('usr_1'), papel: 'espectador', token: 'a', expiraEm: new Date() };
        const pacoteInvalido = pacoteId('pct_invalido');
        const meio: MeioPagamento = 'simulado';

        const resultado = await sut.recarregar(sessao, pacoteInvalido, meio);
        assert.equal(resultado.ok, false);
      },
    },
    {
      nome: 'Deve retornar recibo com moeda creditada na recarga com sucesso',
      executar: async () => {
        const sut = criarSut();
        const sessao: Sessao = { usuarioId: usuarioId('usr_1'), papel: 'espectador', token: 'a', expiraEm: new Date() };
        const pacoteValido = pacoteId('pct_valido');
        const meio: MeioPagamento = 'simulado';

        const resultado = await sut.recarregar(sessao, pacoteValido, meio);
        assert.equal(resultado.ok, true);
        if (resultado.ok) {
          assert.equal(resultado.valor.pacote, pacoteValido);
          assert.ok(resultado.valor.moedaCreditada > 0);
          assert.equal(resultado.valor.meio, meio);
        }
      },
    },
  ];
}