import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Account, AccountStatus, Credential, TwoFactorAuth, generateTotp, criarAutenticacao } from '@g6/identidade';
import { Aplicacao } from '../http/app';
import { criarContexto, registrarRotasCA01 } from '../rotas';
import { compor } from '../ca01';
import { criarRegistroAutenticacao } from './index';

async function ambiente() {
  let agora = new Date();
  const segredo = Buffer.from('segredo-publico-do-teste');
  const contas = ['CREATOR', 'VIEWER'].map((role) => new Account({ id: role,
    email: `${role.toLowerCase()}@teste.test`, role: role as 'CREATOR' | 'VIEWER',
    status: AccountStatus.ACTIVE, credential: Credential.fromPlainText('Senha-teste!', { N: 1024, r: 8, p: 1 }),
    twoFactor: role === 'CREATOR' ? new TwoFactorAuth(segredo) : null }));
  const port = criarAutenticacao(contas, { relogio: () => agora });
  const app = new Aplicacao(); const ctx = criarContexto(compor());
  registrarRotasCA01(app, ctx); criarRegistroAutenticacao(port)(app, ctx);
  const servidor = app.criarServidor(); servidor.listen(0, '127.0.0.1'); await once(servidor, 'listening');
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return { base, codigo: () => generateTotp(segredo, agora),
    avancar: () => { agora = new Date(agora.getTime() + 30_000); },
    fechar: () => new Promise<void>((resolve, reject) => { servidor.closeAllConnections(); servidor.close(e => e ? reject(e) : resolve()); }),
    async post(caminho: string, corpo: unknown, token?: string) {
      return fetch(base + caminho, { method: 'POST', headers: { 'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) });
    } };
}

test('HTTP real: login de espectador e criador, sessão nas demais rotas e step-up', async () => {
  const a = await ambiente();
  try {
    const viewer = await a.post('/api/login', { email: 'viewer@teste.test', senha: 'Senha-teste!' });
    assert.equal(viewer.status, 200); const v = await viewer.json() as any;
    assert.equal(v.papel, 'espectador'); assert.ok(v.expiraEm);
    const saldo = await fetch(a.base + '/api/saldo', { headers: { authorization: `Bearer ${v.token}` } });
    assert.equal(saldo.status, 200);
    const semTotp = await a.post('/api/login', { email: 'creator@teste.test', senha: 'Senha-teste!' });
    assert.equal(semTotp.status, 401); assert.equal((await semTotp.json() as any).codigo, 'TOTP_REQUIRED');
    const creator = await a.post('/api/login', { email: 'creator@teste.test', senha: 'Senha-teste!', codigoTotp: a.codigo() });
    assert.equal(creator.status, 200); const c = await creator.json() as any; assert.equal(c.papel, 'criador');
    const live = await a.post('/api/lives', { titulo: 'Login real', preset: 'movel' }, c.token);
    assert.equal(live.status, 200);
    a.avancar();
    const step = await a.post('/api/step-up', { codigo: a.codigo() }, c.token);
    assert.equal(step.status, 200);
    assert.equal((await a.post('/api/step-up', { codigo: a.codigo() }, c.token)).status, 401);
    const atual = await fetch(a.base + '/api/sessao', { headers: { authorization: `Bearer ${c.token}` } });
    assert.equal(atual.status, 200); assert.equal((await atual.json() as any).usuario, 'CREATOR');
  } finally { await a.fechar(); }
});

test('HTTP recusa entradas inválidas, senha errada e step-up sem sessão', async () => {
  const a = await ambiente();
  try {
    for (const corpo of [null, [], { email: 1, senha: 'x' }, { email: 'x', senha: {} },
      { email: 'x', senha: 'y', codigoTotp: 123456 }]) {
      assert.equal((await a.post('/api/login', corpo)).status, 400);
    }
    assert.equal((await a.post('/api/login', { email: 'viewer@teste.test', senha: 'errada' })).status, 401);
    assert.equal((await a.post('/api/step-up', { codigo: '123456' })).status, 401);
    const r = await a.post('/api/login', { email: 'viewer@teste.test', senha: 'Senha-teste!' });
    const v = await r.json() as any;
    assert.equal((await a.post('/api/step-up', { codigo: 'abc' }, v.token)).status, 400);
    assert.equal((await fetch(a.base + '/api/sessao', { headers: { authorization: 'Bearer inventado' } })).status, 401);
    const script = await fetch(a.base + '/app.js'); assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type')!, /javascript/);
    assert.match(await script.text(), /Intercapt|Intercepta/);
    assert.equal((await fetch(a.base + '/login.html')).status, 200);
  } finally { await a.fechar(); }
});
