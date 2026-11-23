import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { criarAplicacao } from '../src/servidor';

// Sinalização da câmera da live: só o criador dono liga e responde; o espectador pede e recebe o SDP.
async function iniciar() {
  const { app } = criarAplicacao();
  const servidor = app.criarServidor();
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const chamar = async (metodo: string, caminho: string, token?: string, corpo?: unknown) => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await r.text();
    return { status: r.status, corpo: texto ? JSON.parse(texto) : undefined };
  };
  const entrar = async (papel: string) => (await chamar('POST', '/api/demo/sessao', undefined, { papel })).corpo.token as string;
  return { servidor, chamar, entrar };
}

const SDP = (n: string) => `v=0\r\no=- ${n} 2 IN IP4 127.0.0.1\r\ns=-\r\n`;

test('vídeo: oferta do espectador → resposta do criador, ponta a ponta', async () => {
  const { servidor, chamar, entrar } = await iniciar();
  try {
    const criador = await entrar('criador');
    const live = (await chamar('POST', '/api/lives', criador, { preset: 'movel', titulo: 'Câmera' })).corpo.live as string;
    const base = `/api/lives/${live}/video`;

    assert.deepEqual((await chamar('GET', `${base}/estado`)).corpo, { ativa: false, versao: 0 });
    // Sem câmera ligada, o espectador não consegue pedir o vídeo.
    assert.equal((await chamar('POST', `${base}/ofertas`, undefined, { sdp: SDP('1') })).status, 409);

    const ligada = await chamar('POST', `${base}/camera`, criador, { ativa: true });
    assert.equal(ligada.status, 200);
    assert.deepEqual(ligada.corpo, { ativa: true, versao: 1 });
    assert.deepEqual((await chamar('GET', `${base}/estado`)).corpo, { ativa: true, versao: 1 });

    const oferta = await chamar('POST', `${base}/ofertas`, undefined, { sdp: SDP('1') });
    assert.equal(oferta.status, 200);
    const id = oferta.corpo.id as string;

    const consulta = await chamar('GET', `${base}/ofertas`, criador);
    assert.deepEqual(consulta.corpo.ofertas, [{ id, sdp: SDP('1') }]);
    assert.deepEqual((await chamar('GET', `${base}/ofertas`, criador)).corpo.ofertas, [], 'a oferta é entregue uma só vez');

    assert.deepEqual((await chamar('GET', `${base}/respostas/${id}`)).corpo, { pronta: false });
    assert.equal((await chamar('POST', `${base}/respostas`, criador, { id, sdp: SDP('2') })).status, 200);
    assert.deepEqual((await chamar('GET', `${base}/respostas/${id}`)).corpo, { pronta: true, sdp: SDP('2') });
    assert.deepEqual((await chamar('GET', `${base}/respostas/${id}`)).corpo, { pronta: false }, 'a resposta é entregue uma só vez');

    // Desligar limpa tudo; ligar de novo muda a versão para os espectadores reconectarem.
    await chamar('POST', `${base}/camera`, criador, { ativa: false });
    assert.equal((await chamar('GET', `${base}/estado`)).corpo.ativa, false);
    assert.equal((await chamar('POST', `${base}/camera`, criador, { ativa: true })).corpo.versao, 2);

    // Live encerrada: some o vídeo.
    await chamar('POST', `/api/lives/${live}/encerrar`, criador);
    assert.deepEqual((await chamar('GET', `${base}/estado`)).corpo, { ativa: false, versao: 0 });
  } finally {
    servidor.close();
  }
});

test('vídeo: só o criador dono da live controla a câmera e as entradas são validadas', async () => {
  const { servidor, chamar, entrar } = await iniciar();
  try {
    const criador = await entrar('criador');
    const espectador = await entrar('espectador');
    const live = (await chamar('POST', '/api/lives', criador, { preset: 'movel', titulo: 'Câmera' })).corpo.live as string;
    const base = `/api/lives/${live}/video`;

    assert.equal((await chamar('POST', `${base}/camera`, undefined, { ativa: true })).status, 401);
    assert.equal((await chamar('POST', `${base}/camera`, espectador, { ativa: true })).status, 403);
    assert.equal((await chamar('GET', `${base}/ofertas`, espectador)).status, 403);
    assert.equal((await chamar('POST', `${base}/camera`, criador, { ativa: 'sim' })).status, 400);
    assert.equal((await chamar('POST', '/api/lives/inexistente/video/camera', criador, { ativa: true })).status, 404);

    await chamar('POST', `${base}/camera`, criador, { ativa: true });
    assert.equal((await chamar('POST', `${base}/ofertas`, undefined, { sdp: 'não é sdp' })).status, 400);
    assert.equal((await chamar('POST', `${base}/ofertas`, undefined, { sdp: 'v=0' + 'x'.repeat(50_000) })).status, 400);
    assert.equal((await chamar('POST', `${base}/respostas`, criador, { id: 1, sdp: SDP('2') })).status, 400);
    assert.equal((await chamar('POST', `${base}/respostas`, espectador, { id: 'x', sdp: SDP('2') })).status, 403);
  } finally {
    servidor.close();
  }
});

test('vídeo: sem sinal do criador a câmera deixa de contar como ligada', async (t) => {
  const { servidor, chamar, entrar } = await iniciar();
  try {
    const criador = await entrar('criador');
    const live = (await chamar('POST', '/api/lives', criador, { preset: 'movel', titulo: 'Câmera' })).corpo.live as string;
    const base = `/api/lives/${live}/video`;
    await chamar('POST', `${base}/camera`, criador, { ativa: true });

    const agora = Date.now();
    t.mock.method(Date, 'now', () => agora + 7_000);
    assert.equal((await chamar('GET', `${base}/estado`)).corpo.ativa, false);
  } finally {
    servidor.close();
  }
});
