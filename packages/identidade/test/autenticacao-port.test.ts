import assert from 'node:assert/strict';
import { test } from 'node:test';
import { casosAutenticacaoPort } from '@g6/shared-kernel/testing';
import { AutenticacaoService, criarAutenticacao, criarAutenticacaoExemplo } from '../src/index';
import { makeAccount, makeDeps, NOW, TOTP_SECRET } from './helpers';
import { generateTotp } from '../src/autenticacao/dominio/two-factor-auth';
import { AccountStatus } from '../src/autenticacao/dominio/account';

for (const caso of casosAutenticacaoPort(() => criarAutenticacao([
  makeAccount('teste@teste.com', 'senha_valida'),
]))) test(`Contrato real: ${caso.nome}`, caso.executar);

function montar() {
  let now = new Date(NOW);
  const conta = makeAccount('criador@teste.com', 'Senha-forte!', { role: 'CREATOR', twoFactor: true });
  const { deps, sessions } = makeDeps([conta]);
  const sut = new AutenticacaoService({ dependencias: deps, relogio: () => now });
  const login = () => sut.login({ email: conta.email, senha: 'Senha-forte!',
    codigoTotp: generateTotp(TOTP_SECRET, now) });
  return { sut, conta, sessions, login, avancar: () => { now = new Date(now.getTime() + 30_000); }, codigo: () => generateTotp(TOTP_SECRET, now) };
}

test('criador exige TOTP e não emite sessão em tentativas recusadas', async () => {
  const { sut, sessions } = montar();
  for (const codigoTotp of [undefined, 'incorreto']) {
    assert.equal((await sut.login({ email: 'criador@teste.com', senha: 'Senha-forte!', codigoTotp })).ok, false);
  }
  assert.equal(sessions.sessions.length, 0);
});

test('step-up valida sessão, aceita novo TOTP, não altera original e recusa replay', async () => {
  const m = montar();
  const r = await m.login(); assert.ok(r.ok);
  const original = { ...r.valor, expiraEm: new Date(r.valor.expiraEm) };
  assert.equal((await m.sut.stepUp(r.valor, { tipo: 'totp', codigo: m.codigo() })).ok, false);
  m.avancar();
  const elevado = await m.sut.stepUp(r.valor, { tipo: 'totp', codigo: m.codigo() });
  assert.ok(elevado.ok); assert.notEqual(elevado.valor, r.valor);
  assert.deepEqual(r.valor, original);
  assert.equal((await m.sut.stepUp(r.valor, { tipo: 'totp', codigo: m.codigo() })).ok, false);
});

test('step-up recusa token e papel adulterados, sessão revogada, expirada e de outra instância', async () => {
  const m = montar(); const r = await m.login(); assert.ok(r.ok); m.avancar();
  for (const sessao of [{ ...r.valor, token: 'inventado' }, { ...r.valor, papel: 'espectador' as const },
    { ...r.valor, expiraEm: new Date('2099-01-01') }]) {
    assert.equal((await m.sut.stepUp(sessao, { tipo: 'totp', codigo: m.codigo() })).ok, false);
  }
  assert.equal((await montar().sut.stepUp(r.valor, { tipo: 'totp', codigo: m.codigo() })).ok, false);
  m.sessions.sessions[0]!.revoke();
  assert.equal((await m.sut.stepUp(r.valor, { tipo: 'totp', codigo: m.codigo() })).ok, false);
  const outra = montar(); const s = await outra.login(); assert.ok(s.ok);
  outra.sessions.sessions[0]!.expiresAt.setTime(NOW.getTime() - 1);
  assert.equal((await outra.sut.stepUp(s.valor, { tipo: 'totp', codigo: outra.codigo() })).ok, false);
});

test('conta suspensa após login não conclui step-up', async () => {
  const m = montar(); const r = await m.login(); assert.ok(r.ok);
  m.avancar(); m.conta.setStatus(AccountStatus.SUSPENDED);
  assert.equal((await m.sut.stepUp(r.valor, { tipo: 'totp', codigo: m.codigo() })).ok, false);
});

test('espectador sem MFA entra, mas não conclui step-up', async () => {
  const sut = criarAutenticacao([makeAccount('viewer@test.com', 'Senha-forte!')]);
  const r = await sut.login({ email: ' VIEWER@test.com ', senha: 'Senha-forte!' }); assert.ok(r.ok);
  assert.equal(r.valor.papel, 'espectador');
  assert.equal((await sut.stepUp(r.valor, { tipo: 'totp', codigo: '000000' })).ok, false);
});

test('dados públicos de exemplo autenticam criador e espectador reais', async () => {
  const demo = criarAutenticacaoExemplo();
  for (const papel of ['criador', 'espectador']) {
    const r = await demo.autenticacao.login({ email: `${papel}@ca01.test`, senha: demo.senha,
      codigoTotp: papel === 'criador' ? demo.codigoCriador() : undefined });
    assert.ok(r.ok); assert.equal(r.valor.papel, papel);
  }
});
