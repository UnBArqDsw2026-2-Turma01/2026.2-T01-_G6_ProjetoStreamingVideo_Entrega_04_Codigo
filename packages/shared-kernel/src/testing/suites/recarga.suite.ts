import assert from 'node:assert/strict';
import type { RecargaPort } from '../../ports';
import type { MeioPagamento, Sessao } from '../../tipos';
import { pacoteId, usuarioId } from '../../tipos';

export function casosRecargaPort(
  criarSut: () => RecargaPort,
  confirmarPagamento?: (recargaId: string) => Promise<void> | void,
) {
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
      nome: 'Deve criar checkout pendente sem creditar e concluir somente após confirmação',
      executar: async () => {
        const sut = criarSut();
        const sessao: Sessao = { usuarioId: usuarioId('usr_1'), papel: 'espectador', token: 'a', expiraEm: new Date() };
        const pacoteValido = pacoteId('pct_valido');
        const meio: MeioPagamento = 'simulado';

        const checkoutRes = await sut.recarregar(sessao, pacoteValido, meio);
        assert.equal(checkoutRes.ok, true);
        if (!checkoutRes.ok) return;

        const { recargaId } = checkoutRes.valor;
        assert.equal(checkoutRes.valor.pacote, pacoteValido);
        assert.ok(checkoutRes.valor.moedaACreditar > 0);

        const antes = await sut.consultar(sessao, recargaId);
        assert.equal(antes.ok, true);
        if (antes.ok) {
          assert.equal(antes.valor.situacao, 'pendente');
        }

        if (confirmarPagamento) {
          await confirmarPagamento(recargaId);

          const depois = await sut.consultar(sessao, recargaId);
          assert.equal(depois.ok, true);
          if (depois.ok) {
            assert.equal(depois.valor.situacao, 'concluida');
            if (depois.valor.situacao === 'concluida') {
              assert.equal(depois.valor.recibo.recargaId, recargaId);
              assert.equal(depois.valor.recibo.pacote, pacoteValido);
              assert.ok(depois.valor.recibo.moedaCreditada > 0);
            }
          }
        }
      },
    },
    {
      nome: 'Deve falhar ao consultar recarga inexistente ou de outro usuário',
      executar: async () => {
        const sut = criarSut();
        const dono: Sessao = { usuarioId: usuarioId('usr_1'), papel: 'espectador', token: 'a', expiraEm: new Date() };
        const outro: Sessao = { usuarioId: usuarioId('usr_2'), papel: 'espectador', token: 'b', expiraEm: new Date() };

        const checkoutRes = await sut.recarregar(dono, pacoteId('pct_valido'), 'simulado');
        assert.equal(checkoutRes.ok, true);
        if (!checkoutRes.ok) return;

        const consultaOutro = await sut.consultar(outro, checkoutRes.valor.recargaId);
        assert.equal(consultaOutro.ok, false);

        const consultaInexistente = await sut.consultar(dono, 'rec_inexistente');
        assert.equal(consultaInexistente.ok, false);
      },
    },
  ];
}