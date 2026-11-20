// Front-end do CA-01: só fala com a API HTTP (/api/*). Sem dependências nem build.
const $ = (seletor) => document.querySelector(seletor);
const estado = { token: null, papel: null, live: null, checkout: null, fonte: null };

function avisar(texto, ok = false) {
  const el = $('#aviso');
  el.textContent = texto || '';
  el.className = ok ? 'ok' : '';
}

async function api(metodo, caminho, corpo) {
  const r = await fetch(caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(estado.token ? { authorization: `Bearer ${estado.token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : undefined;
  if (!r.ok) throw new Error(dados?.mensagem ?? `Erro ${r.status}`);
  return dados;
}

async function tentar(acao, mensagemOk) {
  try {
    avisar('');
    const r = await acao();
    if (mensagemOk) avisar(mensagemOk, true);
    return r;
  } catch (e) {
    avisar(e.message);
  }
}

// ---- sessão ----
document.querySelectorAll('[data-papel]').forEach((botao) =>
  botao.addEventListener('click', () =>
    tentar(async () => {
      const s = await api('POST', '/api/demo/sessao', { papel: botao.dataset.papel });
      Object.assign(estado, { token: s.token, papel: s.papel });
      $('#quem').textContent = `Sessão: ${s.papel}`;
      document.querySelectorAll('[data-papel]').forEach((b) => b.classList.toggle('ativo', b === botao));
      await atualizar();
    }),
  ),
);

// ---- live ----
$('#form-live').addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  tentar(async () => { await api('POST', '/api/lives', dados); await atualizar(); }, 'Live aberta');
});

$('#encerrar').addEventListener('click', () =>
  tentar(async () => { await api('POST', `/api/lives/${estado.live.live}/encerrar`); await atualizar(); }, 'Live encerrada: o VOD foi criado'));

// ---- recarga ----
async function carregarOfertas() {
  if (estado.papel !== 'espectador') return;
  const [saldo, ofertas] = await Promise.all([api('GET', '/api/saldo'), api('GET', '/api/recarga/ofertas')]);
  $('#saldo').textContent = saldo.moeda;
  const caixa = $('#ofertas');
  caixa.className = '';
  caixa.replaceChildren(...ofertas.map((o) => {
    const linha = document.createElement('div');
    linha.className = 'oferta';
    const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    linha.innerHTML = `<span><strong>${o.moeda}</strong> moedas · ${o.descontoPercentual ? `<s>${reais(o.precoSemDescontoCentavos)}</s> ` : ''}${reais(o.precoCentavos)}<br><small>${o.composicao}</small></span>`;
    const botao = document.createElement('button');
    botao.textContent = 'Comprar';
    botao.addEventListener('click', () => tentar(async () => {
      estado.checkout = await api('POST', '/api/recarga', { pacote: o.pacote, meio: 'simulado' });
      $('#checkout').hidden = false;
      $('#checkout-texto').textContent = `Checkout pendente: ${estado.checkout.moedaACreditar} moedas por ${reais(estado.checkout.valorCobradoCentavos)}.`;
    }));
    linha.append(botao);
    return linha;
  }));
}

$('#confirmar').addEventListener('click', () =>
  tentar(async () => {
    await api('POST', `/api/recarga/${estado.checkout.recargaId}/confirmar`);
    estado.checkout = null;
    $('#checkout').hidden = true;
    await carregarOfertas();
  }, 'Pagamento confirmado: moedas creditadas'));

// ---- doação e chat ----
$('#form-doacao').addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  if (!estado.live) return avisar('Não há live no ar.');
  tentar(async () => {
    await api('POST', `/api/lives/${estado.live.live}/doacoes`, { valor: Number(dados.valor), mensagem: dados.mensagem || undefined });
    e.target.reset();
    await carregarOfertas();
  }, 'Doação enviada');
});

$('#form-chat').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!estado.live) return avisar('Não há live no ar.');
  const texto = new FormData(e.target).get('texto');
  tentar(async () => { await api('POST', `/api/lives/${estado.live.live}/chat`, { texto }); e.target.reset(); });
});

function mostrarMensagem({ destacada, mensagem }) {
  const item = document.createElement('li');
  const nome = document.createElement('b');
  nome.textContent = `${mensagem.nomeAutor}: `;
  const corpo = document.createElement('span');
  corpo.textContent = mensagem.texto;
  if (destacada) {
    item.className = `destaque ${mensagem.cor ?? ''}`;
    const selo = document.createElement('span');
    selo.className = 'selo';
    const fixacao = mensagem.tempoFixacaoMin > 0 ? ` · fixada por ${mensagem.tempoFixacaoMin} min` : '';
    selo.textContent = `${mensagem.valor} moedas${fixacao}`;
    item.append(selo);
    if (mensagem.tempoFixacaoMin > 0) {
      const fixada = item.cloneNode(true);
      fixada.append(nome.cloneNode(true), corpo.cloneNode(true));
      $('#fixadas').append(fixada);
      setTimeout(() => fixada.remove(), mensagem.tempoFixacaoMin * 60_000);
    }
  }
  item.append(nome, corpo);
  const lista = $('#mensagens');
  lista.append(item);
  lista.scrollTop = lista.scrollHeight;
}

function acompanharChat(live) {
  estado.fonte?.close();
  $('#mensagens').replaceChildren();
  $('#fixadas').replaceChildren();
  estado.fonte = live ? new EventSource(`/api/lives/${live.live}/chat/stream`) : null;
  if (estado.fonte) estado.fonte.onmessage = (ev) => mostrarMensagem(JSON.parse(ev.data));
}

// ---- estado geral (live no ar e VODs) ----
async function atualizar() {
  const [lives, vods] = await Promise.all([api('GET', '/api/lives'), api('GET', '/api/vods')]);
  const nova = lives[0] ?? null;
  if (nova?.live !== estado.live?.live) acompanharChat(nova);
  estado.live = nova;
  $('#live-atual').className = nova ? '' : 'vazio';
  $('#live-atual').textContent = nova ? `No ar: ${nova.titulo}` : 'Nenhuma live no ar.';
  $('#encerrar').hidden = !(nova && estado.papel === 'criador');

  const lista = $('#vods');
  lista.className = vods.length ? '' : 'vazio';
  lista.replaceChildren(...(vods.length ? vods : [null]).map((v) => {
    const li = document.createElement('li');
    li.textContent = v ? `${v.titulo} (encerrada às ${new Date(v.encerradaEm).toLocaleTimeString('pt-BR')})` : 'Nenhuma live encerrada ainda.';
    return li;
  }));
  await carregarOfertas();
}

atualizar().catch((e) => avisar(e.message));
setInterval(() => atualizar().catch(() => {}), 4000);
