import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { criarAplicacao } from '../src/servidor';

// CA-01 de ponta a ponta pela API HTTP: abrir live, recarregar, doar com mensagem e encerrar (VOD).
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
  return { servidor, base, chamar, entrar };
}

test('CA-01: live → recarga → doação destacada → chat → VOD', async () => {
  const { servidor, base, chamar, entrar } = await iniciar();
  try {
    const criador = await entrar('criador');
    const espectador = await entrar('espectador');

    const live = await chamar('POST', '/api/lives', criador, { preset: 'baixa-latencia', titulo: 'Final' });
    assert.equal(live.status, 200);
    const id = live.corpo.live as string;

    // Ouvinte do chat (SSE) antes da doação.
    const fluxo = await fetch(`${base}/api/lives/${id}/chat/stream`);
    const leitor = fluxo.body!.getReader();
    await leitor.read(); // comentário de conexão

    // Recarga em dois passos: checkout pendente, depois confirmação (RecargaConcluida credita o saldo).
    const ofertas = await chamar('GET', '/api/recarga/ofertas', espectador);
    assert.equal(ofertas.status, 200);
    const pacote = ofertas.corpo[0].pacote as string;
    const checkout = await chamar('POST', '/api/recarga', espectador, { pacote, meio: 'simulado' });
    assert.equal(checkout.status, 200);
    assert.equal((await chamar('GET', '/api/saldo', espectador)).corpo.moeda, 0);
    const confirmada = await chamar('POST', `/api/recarga/${checkout.corpo.recargaId}/confirmar`, espectador);
    assert.equal(confirmada.corpo.situacao, 'concluida');
    assert.equal((await chamar('GET', '/api/saldo', espectador)).corpo.moeda, 100);

    // 100 de saldo não alcança a faixa mínima de destaque (200): rejeitado sem debitar.
    const curta = await chamar('POST', `/api/lives/${id}/doacoes`, espectador, { valor: 100, mensagem: 'Boa!' });
    assert.equal(curta.status, 422);
    assert.equal(curta.corpo.codigo, 'VALOR_ABAIXO_DO_MINIMO');
    assert.equal((await chamar('GET', '/api/saldo', espectador)).corpo.moeda, 100);

    // Mais uma recarga e doação de 200 com mensagem: sai destacada (azul) no chat.
    const c2 = await chamar('POST', '/api/recarga', espectador, { pacote, meio: 'simulado' });
    await chamar('POST', `/api/recarga/${c2.corpo.recargaId}/confirmar`, espectador);
    const c3 = await chamar('POST', '/api/recarga', espectador, { pacote, meio: 'simulado' });
    await chamar('POST', `/api/recarga/${c3.corpo.recargaId}/confirmar`, espectador);
    assert.equal((await chamar('GET', '/api/saldo', espectador)).corpo.moeda, 300);

    const doacao = await chamar('POST', `/api/lives/${id}/doacoes`, espectador, { valor: 200, mensagem: 'Parabéns!' });
    assert.equal(doacao.status, 200);
    assert.equal(doacao.corpo.destaqueEntregue, true);
    assert.equal((await chamar('GET', '/api/saldo', espectador)).corpo.moeda, 100);

    const { value } = await leitor.read();
    const evento = JSON.parse(new TextDecoder().decode(value).replace(/^data: /, ''));
    assert.equal(evento.destacada, true);
    assert.equal(evento.mensagem.cor, 'AZUL');
    assert.equal(evento.mensagem.valor, 200);
    await leitor.cancel();

    // Moderação barra a ofensa; mensagem comum passa.
    assert.equal((await chamar('POST', `/api/lives/${id}/chat`, espectador, { texto: 'sua ofensa' })).status, 422);
    assert.equal((await chamar('POST', `/api/lives/${id}/chat`, espectador, { texto: 'oi' })).status, 200);

    // Só o dono encerra; ao encerrar a live vira VOD e deixa de aceitar doação.
    assert.equal((await chamar('POST', `/api/lives/${id}/encerrar`, espectador)).status, 403);
    assert.equal((await chamar('POST', `/api/lives/${id}/encerrar`, criador)).status, 200);
    const vods = await chamar('GET', '/api/vods');
    assert.equal(vods.corpo.length, 1);
    assert.equal(vods.corpo[0].titulo, 'Final');
    assert.equal((await chamar('POST', `/api/lives/${id}/doacoes`, espectador, { valor: 100 })).corpo.codigo, 'LIVE_ENCERRADA');
  } finally {
    servidor.closeAllConnections();
    servidor.close();
  }
});

test('rotas protegidas exigem sessão e só criador abre live', async () => {
  const { servidor, chamar, entrar } = await iniciar();
  try {
    assert.equal((await chamar('POST', '/api/lives', undefined, { preset: 'movel', titulo: 'x' })).status, 401);
    const espectador = await entrar('espectador');
    assert.equal((await chamar('POST', '/api/lives', espectador, { preset: 'movel', titulo: 'x' })).status, 403);
    assert.equal((await chamar('POST', '/api/lives', espectador, { preset: 'invalido', titulo: 'x' })).status, 400);
  } finally {
    servidor.closeAllConnections();
    servidor.close();
  }
});

test('recarga oferece o catálogo com desconto e imposto; faixas vêm da API', async () => {
  const { servidor, chamar, entrar } = await iniciar();
  try {
    const espectador = await entrar('espectador');
    const ofertas = (await chamar('GET', '/api/recarga/ofertas', espectador)).corpo;
    assert.equal(ofertas.length, 8);
    assert.deepEqual(ofertas.slice(0, 2).map((o: { moeda: number; precoCentavos: number; descontoPercentual: number }) => [o.moeda, o.precoCentavos, o.descontoPercentual]), [
      [100, 499, 5],
      [210, 966, 8],
    ]);
    assert.ok(ofertas.every((o: { composicao: string }) => /imposto de 5%/.test(o.composicao)));

    const maior = ofertas.at(-1);
    const checkout = await chamar('POST', '/api/recarga', espectador, { pacote: maior.pacote, meio: 'simulado' });
    assert.equal(checkout.corpo.moedaACreditar, 28000);
    assert.equal(checkout.corpo.valorCobradoCentavos, maior.precoCentavos);

    // Sem `.env`, a recarga real oferece só o meio simulado.
    assert.deepEqual((await chamar('GET', '/api/recarga/meios', espectador)).corpo, ['simulado']);

    const faixas = (await chamar('GET', '/api/faixas')).corpo;
    assert.deepEqual(faixas.map((f: { minimo: number }) => f.minimo), [200, 500, 2000, 5000, 50000]);
    assert.deepEqual(faixas[1], { minimo: 500, cor: 'VERDE', fixacaoMin: 2, limite: 150 });
  } finally {
    servidor.closeAllConnections();
    servidor.close();
  }
});
