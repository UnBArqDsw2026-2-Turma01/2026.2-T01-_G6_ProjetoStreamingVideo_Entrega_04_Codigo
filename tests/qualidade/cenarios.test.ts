import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EventBusEmMemoria, canalId, liveId, type MensagemEntregue } from '@g6/shared-kernel';
import { ChatService } from '@g6/chat';
import { ModeracaoService, AutoModPipelineConcreto, EstrategiaToxicidade } from '@g6/moderacao';
import { criarDoacao, criarIdentidade, mensagem, SENHA } from './cenario';

const raiz = fileURLToPath(new URL('../../', import.meta.url));

test('QA-01 — credencial incorreta não emite sessão e mantém recusa genérica', async () => {
  const c = criarIdentidade();
  const errada = await c.autenticacao.login({ email: c.espectador.email, senha: 'errada' });
  const ausente = await c.autenticacao.login({ email: 'ausente@qa.test', senha: 'errada' });
  assert.equal(errada.ok, false); assert.equal(ausente.ok, false);
  if (errada.ok || ausente.ok) assert.fail('Credencial recusada não pode emitir sessão');
  assert.equal(errada.erro.codigo, 'INVALID_CREDENTIALS');
  assert.deepEqual(errada.erro, ausente.erro);
  assert.equal(c.sessoes.sessions.length, 0);
});

test('QA-02 — MFA obrigatório e step-up sem replay nem mutação da sessão', async () => {
  const c = criarIdentidade();
  for (const codigoTotp of [undefined, 'invalido'])
    assert.equal((await c.autenticacao.login({ email: c.criador.email, senha: SENHA, codigoTotp })).ok, false);
  assert.equal(c.sessoes.sessions.length, 0);
  const r = await c.autenticacao.login({ email: c.criador.email, senha: SENHA, codigoTotp: c.codigo() });
  assert.ok(r.ok); assert.equal(c.sessoes.sessions.length, 1);
  const original = { ...r.valor, expiraEm: new Date(r.valor.expiraEm) };
  assert.equal((await c.autenticacao.stepUp(r.valor, { tipo: 'totp', codigo: c.codigo() })).ok, false);
  c.avancar(30_000);
  const elevada = await c.autenticacao.stepUp(r.valor, { tipo: 'totp', codigo: c.codigo() });
  assert.ok(elevada.ok); assert.notEqual(elevada.valor, r.valor); assert.deepEqual(r.valor, original);
  assert.equal((await c.autenticacao.stepUp(r.valor, { tipo: 'totp', codigo: c.codigo() })).ok, false);
  assert.equal((await c.autenticacao.stepUp({ ...r.valor, token: 'forjado' }, { tipo: 'totp', codigo: c.codigo() })).ok, false);
});

test('QA-03 — cinco falhas bloqueiam a sexta tentativa e a janela expira', async () => {
  const c = criarIdentidade();
  for (let i = 0; i < 5; i++) {
    const r = await c.autenticacao.login({ email: c.espectador.email, senha: 'errada' });
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.erro.codigo, 'INVALID_CREDENTIALS');
  }
  const sexta = await c.autenticacao.login({ email: c.espectador.email, senha: SENHA });
  assert.equal(sexta.ok, false); if (!sexta.ok) assert.equal(sexta.erro.codigo, 'RATE_LIMITED');
  assert.equal(c.sessoes.sessions.length, 0);
  c.avancar(15 * 60_000);
  assert.ok((await c.autenticacao.login({ email: c.espectador.email, senha: SENHA })).ok);
  assert.equal(c.sessoes.sessions.length, 1);
});

test('QA-04 — AutoMod real decide e chat real entrega apenas mensagens aprovadas', async () => {
  const moderacao = new ModeracaoService();
  const chat = new ChatService({ moderacao, eventos: new EventBusEmMemoria() });
  const live = liveId('qa04'); const entregas: MensagemEntregue[] = [];
  chat.inscrever(live, m => entregas.push(m));
  const casos = [
    ['use h@ck e a1mb0t agora', 'bloqueada'],
    ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'quarentena'],
    ['resgate free-robux.site agora em http://phish.test e http://outro.test', 'bloqueada'],
    ['Parabéns pela live de hoje!', 'aprovada'],
  ] as const;
  for (const [texto, esperado] of casos) {
    const m = mensagem(texto); const antes = structuredClone(m); const quantidade = entregas.length;
    assert.equal((await moderacao.avaliar(m)).decisao, esperado);
    const r = await chat.publicar(live, m);
    assert.equal(r.ok, esperado === 'aprovada'); assert.deepEqual(m, antes);
    assert.equal(entregas.length, quantidade + (esperado === 'aprovada' ? 1 : 0));
  }
  assert.equal(entregas.length, 1); assert.equal(chat.entradasQuarentena.length, 1);
});

test('QA-05 — falha retornada pelo chat não desfaz débito, repasse ou confirmação', async () => {
  for (const falhar of [false, true]) {
    const identidade = criarIdentidade();
    const criador = await identidade.autenticacao.login({ email: identidade.criador.email, senha: SENHA, codigoTotp: identidade.codigo() });
    const espectador = await identidade.autenticacao.login({ email: identidade.espectador.email, senha: SENHA });
    assert.ok(criador.ok); assert.ok(espectador.ok);
    const c = criarDoacao(criador.valor, espectador.valor, falhar);
    const r = await c.servico.doar(espectador.valor, c.live, 500, 'Parabéns pela live de hoje!');
    assert.ok(r.ok); assert.equal(r.valor.destaqueEntregue, !falhar);
    if (falhar) assert.match(r.valor.aviso ?? '', /Chat indisponível/);
    assert.equal(c.doador.carteira.saldoMoedaVirtual, 500);
    assert.equal(c.criador.carteira.saldoDinheiro.centavos, 1000);
    assert.equal(c.eventos.length, 1); assert.equal(c.eventos[0]!.valor, 500);
    assert.equal(c.eventos[0]!.doador, espectador.valor.usuarioId);
    assert.equal(c.eventos[0]!.live, c.live);
    assert.equal(c.recebidas.length, falhar ? 0 : 1);
  }
});

test('QA-06 — troca de estratégia e regras arquiteturais verificáveis', async () => {
  const reduzida = new ModeracaoService(new AutoModPipelineConcreto([new EstrategiaToxicidade()]));
  assert.equal((await reduzida.avaliar(mensagem('Veja http://exemplo.com'))).decisao, 'aprovada');
  assert.equal((await reduzida.avaliar(mensagem('Seu palavrão'))).decisao, 'bloqueada');
  const executar = (script: string) => spawnSync('npm', ['run', script, '--prefix', 'scripts/arquitetura'],
    { cwd: raiz, encoding: 'utf8', timeout: 60_000 });
  const normal = executar('verificar');
  assert.equal(normal.status, 0, normal.error?.message ?? normal.stdout + normal.stderr);
  const violacao = executar('violacao');
  assert.equal(violacao.error, undefined); assert.notEqual(violacao.status, 0);
  for (const regra of ['contexto-so-importa-shared-kernel', 'shared-kernel-isolado', 'g6-nao-resolvido'])
    assert.match(violacao.stdout + violacao.stderr, new RegExp(regra));
});

test('QA-07 — bus real preserva ordem e entrega aos demais após falha', () => {
  const evento = (id: string) => ({ tipo: 'LiveIniciada' as const, live: liveId(id), canal: canalId('c'), em: new Date() });
  const bus = new EventBusEmMemoria(); const ordem: string[] = [];
  bus.assinar('LiveIniciada', e => { ordem.push(`a:${e.live}`); if (e.live === '1') bus.publicar(evento('2')); });
  bus.assinar('LiveIniciada', e => ordem.push(`b:${e.live}`));
  bus.publicar(evento('1')); assert.deepEqual(ordem, ['a:1', 'b:1', 'a:2', 'b:2']);
  const falho = new EventBusEmMemoria(); const entregas: string[] = [];
  falho.assinar('LiveIniciada', e => { if (e.live === '1') { falho.publicar(evento('2')); throw new Error('falha injetada'); } });
  falho.assinar('LiveIniciada', e => entregas.push(`b:${e.live}`));
  assert.throws(() => falho.publicar(evento('1')), AggregateError);
  assert.deepEqual(entregas, ['b:1', 'b:2']);
});
