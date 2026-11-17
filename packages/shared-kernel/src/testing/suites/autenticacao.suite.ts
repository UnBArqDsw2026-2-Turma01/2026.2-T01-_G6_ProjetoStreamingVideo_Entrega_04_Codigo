import assert from 'node:assert/strict';
import type { AutenticacaoPort } from '../../ports';
import type { Credenciais, FatorAdicional, Sessao } from '../../tipos';
import { usuarioId } from '../../tipos';

export function casosAutenticacaoPort(criarSut: () => AutenticacaoPort) {
  return [
    {
      nome: 'Deve falhar o login com credenciais incorretas',
      executar: async () => {
        const sut = criarSut();
        const credenciaisIncorretas: Credenciais = { email: 'teste@teste.com', senha: 'senha_invalida' };

        const resultado = await sut.login(credenciaisIncorretas);
        assert.equal(resultado.ok, false);
      },
    },
    {
      nome: 'Deve realizar login com sucesso e retornar sessão',
      executar: async () => {
        const sut = criarSut();
        const credenciais: Credenciais = { email: 'teste@teste.com', senha: 'senha_valida' };

        const resultado = await sut.login(credenciais);
        assert.equal(resultado.ok, true);
        if (resultado.ok) {
          assert.ok(resultado.valor.token);
          assert.ok(resultado.valor.usuarioId);
        }
      },
    },
    {
      nome: 'Deve falhar o step-up com TOTP incorreto',
      executar: async () => {
        const sut = criarSut();
        const sessao: Sessao = { usuarioId: usuarioId('usr_1'), papel: 'criador', token: 'a', expiraEm: new Date() };
        const fatorIncorreto: FatorAdicional = { tipo: 'totp', codigo: '000000' };

        const resultado = await sut.stepUp(sessao, fatorIncorreto);
        assert.equal(resultado.ok, false);
      },
    },
  ];
}