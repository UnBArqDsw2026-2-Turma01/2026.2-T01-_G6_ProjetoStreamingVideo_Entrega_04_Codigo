import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { criarAplicacao } from '../src/servidor';

// Gravação da live: o criador envia pedaços de vídeo; qualquer um assiste depois; tudo é temporário.
async function iniciar() {
  const pasta = join(mkdtempSync(join(tmpdir(), 'ca01-vods-')), 'vods');
  const { app, gravacoes } = criarAplicacao({ pastaVods: pasta });
  const servidor = app.criarServidor();
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const pedir = (metodo: string, caminho: string, opcoes: { token?: string; corpo?: unknown; bruto?: Uint8Array; headers?: Record<string, string> } = {}) =>
    fetch(base + caminho, {
      method: metodo,
      headers: {
        ...(opcoes.bruto ? {} : { 'content-type': 'application/json' }),
        ...(opcoes.token ? { authorization: `Bearer ${opcoes.token}` } : {}),
        ...opcoes.headers,
      },
      body: opcoes.bruto ?? (opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo)),
    });
  const json = async (r: Response) => ({ status: r.status, corpo: (await r.text().then((t) => (t ? JSON.parse(t) : undefined))) as any });
  const entrar = async (papel: string) => (await json(await pedir('POST', '/api/demo/sessao', { corpo: { papel } }))).corpo.token as string;
  const limpar = () => { servidor.close(); rmSync(join(pasta, '..'), { recursive: true, force: true }); };
  return { pasta, gravacoes, pedir, json, entrar, limpar };
}

test('gravação: envia pedaços, assiste depois (com Range) e apaga tudo ao limpar', async () => {
  const { pasta, gravacoes, pedir, json, entrar, limpar } = await iniciar();
  try {
    const criador = await entrar('criador');
    const live = (await json(await pedir('POST', '/api/lives', { token: criador, corpo: { preset: 'movel', titulo: 'Gravada' } }))).corpo.live as string;

    const parte = await json(await pedir('POST', `/api/lives/${live}/gravacao`, { token: criador, corpo: { tipo: 'video/webm;codecs=vp8,opus' } }));
    assert.equal(parte.status, 200);
    assert.equal(parte.corpo.parte, 0);

    const a = Buffer.from('0123456789');
    const b = Buffer.from('abcdefghij');
    for (const pedaco of [a, b]) {
      const r = await json(await pedir('POST', `/api/lives/${live}/gravacao/0`, { token: criador, bruto: pedaco }));
      assert.equal(r.status, 200);
    }
    assert.deepEqual((await json(await pedir('GET', '/api/vods/gravacoes'))).corpo, { [live]: [{ parte: 0, tipo: 'video/webm' }] });

    // Leitura aberta (sem sessão) do arquivo inteiro e de um trecho.
    const inteiro = await pedir('GET', `/api/vods/${live}/video/0`);
    assert.equal(inteiro.status, 200);
    assert.equal(inteiro.headers.get('content-type'), 'video/webm');
    assert.equal(Buffer.from(await inteiro.arrayBuffer()).toString(), '0123456789abcdefghij');
    const trecho = await pedir('GET', `/api/vods/${live}/video/0`, { headers: { range: 'bytes=5-14' } });
    assert.equal(trecho.status, 206);
    assert.equal(trecho.headers.get('content-range'), 'bytes 5-14/20');
    assert.equal(Buffer.from(await trecho.arrayBuffer()).toString(), '56789abcde');
    assert.equal((await pedir('GET', `/api/vods/${live}/video/0`, { headers: { range: 'bytes=99-' } })).status, 416);

    assert.equal(readFileSync(gravacoes.parte(live, 0)!.arquivo).length, 20);
    gravacoes.limpar();
    assert.equal(existsSync(pasta), false, 'a pasta temporária some');
    assert.deepEqual((await json(await pedir('GET', '/api/vods/gravacoes'))).corpo, {});
  } finally {
    limpar();
  }
});

test('gravação: só o criador dono grava; tipo, trecho e tamanho são validados', async () => {
  const { pedir, json, entrar, limpar } = await iniciar();
  try {
    const criador = await entrar('criador');
    const espectador = await entrar('espectador');
    const live = (await json(await pedir('POST', '/api/lives', { token: criador, corpo: { preset: 'movel', titulo: 'Gravada' } }))).corpo.live as string;
    const caminho = `/api/lives/${live}/gravacao`;

    assert.equal((await json(await pedir('POST', caminho, { corpo: { tipo: 'video/webm' } }))).status, 401);
    assert.equal((await json(await pedir('POST', caminho, { token: espectador, corpo: { tipo: 'video/webm' } }))).status, 403);
    assert.equal((await json(await pedir('POST', caminho, { token: criador, corpo: { tipo: 'application/x-sh' } }))).status, 400);
    assert.equal((await json(await pedir('POST', '/api/lives/outra/gravacao', { token: criador, corpo: { tipo: 'video/webm' } }))).status, 404);

    await pedir('POST', caminho, { token: criador, corpo: { tipo: 'video/webm' } });
    assert.equal((await json(await pedir('POST', `${caminho}/0`, { bruto: Buffer.from('x') }))).status, 403);
    assert.equal((await json(await pedir('POST', `${caminho}/0`, { token: espectador, bruto: Buffer.from('x') }))).status, 403);
    assert.equal((await json(await pedir('POST', `${caminho}/7`, { token: criador, bruto: Buffer.from('x') }))).status, 404);
    assert.equal((await json(await pedir('POST', `${caminho}/0`, { token: criador, bruto: Buffer.alloc(17 * 1024 * 1024) }))).status, 413);
    // Trecho vazio (sem bytes) não aparece como gravação assistível.
    assert.deepEqual((await json(await pedir('GET', '/api/vods/gravacoes'))).corpo, {});
    assert.equal((await json(await pedir('GET', `/api/vods/${live}/video/0`))).status, 404);
  } finally {
    limpar();
  }
});
