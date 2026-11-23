// Front-end do CA-01: só fala com a API HTTP (/api/*). Sem dependências nem build.
import { criarVideo } from '/video.js';
const $ = (seletor) => document.querySelector(seletor);
const estado = { token: null, papel: null, usuario: null, live: null, escolhida: null, checkout: null, fonte: null };

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

// ---- câmera da live (WebRTC, ver video.js) ----
const video = criarVideo({ estado, api, avisar, $ });

// ---- sessão ----
document.querySelectorAll('[data-papel]').forEach((botao) =>
  botao.addEventListener('click', () =>
    tentar(async () => {
      const s = await api('POST', '/api/demo/sessao', { papel: botao.dataset.papel });
      Object.assign(estado, { token: s.token, papel: s.papel, usuario: s.usuario });
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
  tentar(async () => { await video.parar(); await api('POST', `/api/lives/${estado.live.live}/encerrar`); await atualizar(); }, 'Live encerrada: a gravação está em Transmissões anteriores'));

// ---- recarga ----
const ESTRELA = '<svg class="estrela" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.4l-5 2.65.95-5.6L3.9 9.5l5.6-.8z"/></svg>';
// 2400 → "2,4K"; o valor cheio aparece ao passar o mouse no cartão.
const compacto = (n) => (n < 1000 ? n.toLocaleString('pt-BR') : `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}K`);

// Quantidade que se transforma da forma compacta na cheia ao passar o mouse (2,4K → 2.400):
// a vírgula vira ponto, os dígitos que faltam entram um a um e o "K" sai.
function quantidadeAnimada(n) {
  const cheia = n.toLocaleString('pt-BR');
  if (n < 1000) return `<span class="num">${cheia}</span>`;
  const [inteiro, resto] = cheia.split('.');
  const decimais = compacto(n).slice(inteiro.length + 1, -1);
  // Formas que não se alinham (ex.: arredondamento) trocam sem a transformação.
  if (cheia.split('.').length !== 2 || !resto.startsWith(decimais)) return `<span class="num">${compacto(n)}</span>`;
  const digitos = [...resto].map((d, i) => `<span class="dig${i < decimais.length ? '' : ' entra'}" style="--i:${i - decimais.length}">${d}</span>`).join('');
  return `<span class="num">${inteiro}<span class="sep${decimais ? ' com-virgula' : ''}"><span class="virgula">,</span><span class="ponto">.</span></span>${digitos}<span class="k">K</span></span>`;
}
const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const imposto = (o) => /imposto de (\d+(?:[.,]\d+)?)%/.exec(o.composicao)?.[1];

async function carregarOfertas() {
  if (!estado.token) return; // qualquer conta logada recarrega (o criador também doa em outras lives)
  const [saldo, ofertas] = await Promise.all([api('GET', '/api/saldo'), api('GET', '/api/recarga/ofertas')]);
  $('#saldo').textContent = saldo.moeda.toLocaleString('pt-BR');
  $('#saldo-doacao').textContent = saldo.moeda.toLocaleString('pt-BR');
  const caixa = $('#ofertas');
  // Só redesenha quando as ofertas mudam: redesenhar a cada atualização cortaria as animações de hover.
  const chave = JSON.stringify(ofertas);
  if (caixa.dataset.chave === chave) {
    caixa.querySelectorAll('.pacote').forEach((p, i) => p.classList.toggle('selecionado', estado.checkout?.pacote === ofertas[i].pacote));
    return;
  }
  caixa.dataset.chave = chave;
  caixa.className = 'pacotes';
  caixa.replaceChildren(...ofertas.map((o) => {
    const botao = document.createElement('button');
    botao.type = 'button';
    // Mantém o pacote escolhido marcado enquanto o checkout dele estiver pendente (a lista é redesenhada a cada atualização).
    botao.className = estado.checkout?.pacote === o.pacote ? 'pacote selecionado' : 'pacote';
    const taxa = imposto(o);
    botao.innerHTML = `
      ${o.descontoPercentual ? `<span class="faixa-off">${o.descontoPercentual}% OFF</span>` : ''}
      <strong class="qtd" aria-label="${o.moeda.toLocaleString('pt-BR')} moedas">${quantidadeAnimada(o.moeda)} ${ESTRELA}</strong>
      ${o.descontoPercentual ? `<span class="antigo"><s>${reais(o.precoSemDescontoCentavos)}</s> <span class="off-inline">${o.descontoPercentual}% OFF</span></span>` : ''}
      <span class="preco"><span>R$</span> ${(o.precoCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
      ${taxa ? `<small>(Imposto de ${taxa}% incluso)</small>` : ''}`;
    botao.addEventListener('click', () => tentar(async () => {
      estado.checkout = await api('POST', '/api/recarga', { pacote: o.pacote, meio: 'simulado' });
      caixa.querySelectorAll('.pacote').forEach((p) => p.classList.toggle('selecionado', p === botao));
      $('#checkout').hidden = false;
      $('#checkout-texto').innerHTML = `${estado.checkout.moedaACreditar.toLocaleString('pt-BR')} ${ESTRELA} por ${reais(estado.checkout.valorCobradoCentavos)}`;
    }));
    return botao;
  }));
}

$('#confirmar').addEventListener('click', () =>
  tentar(async () => {
    await api('POST', `/api/recarga/${estado.checkout.recargaId}/confirmar`);
    estado.checkout = null;
    $('#checkout').hidden = true;
    await carregarOfertas();
  }, 'Pagamento confirmado: moedas creditadas'));

// ---- doação com mensagem destacada ----
let faixas = [];
const dialogo = $('#dialogo-doacao');
const formDoacao = $('#form-doacao');
const campoValor = formDoacao.elements.valor;
const campoMensagem = formDoacao.elements.mensagem;
const slider = $('#faixa-slider');

const faixaDe = (valor) => faixas.filter((f) => valor >= f.minimo).at(-1);
const duracao = (min) => (min >= 60 ? `${min / 60} ${min === 60 ? 'hora' : 'horas'}` : `${min} minutos`);
const nomeDoPapel = (papel) => (papel === 'criador' ? 'Criador' : papel === 'moderador' ? 'Moderador' : 'Espectador');

// Matiz do avatar a partir do nome (hash FNV-1a): nomes parecidos caem em cores bem diferentes.
function matizDoNome(nome) {
  let h = 0x811c9dc5;
  for (let i = 0; i < nome.length; i++) h = Math.imul(h ^ nome.charCodeAt(i), 0x01000193);
  return (h >>> 0) % 360;
}

function avatar(nome) {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.textContent = nome[0]?.toUpperCase() ?? '?';
  el.style.background = `hsl(${matizDoNome(nome)} 45% 45%)`;
  return el;
}

function sincronizar(origem) {
  if (!faixas.length) return;
  if (origem === 'slider') campoValor.value = faixas[Number(slider.value)].minimo;
  const valor = Math.max(0, Math.floor(Number(campoValor.value) || 0));
  const faixa = faixaDe(valor);
  slider.value = faixa ? faixas.indexOf(faixa) : 0;
  slider.style.setProperty('--preenchido', `${(Number(slider.value) / (faixas.length - 1)) * 100}%`);
  formDoacao.className = faixa ? faixa.cor : 'SEM-FAIXA';
  $('#previa-valor').innerHTML = `${valor.toLocaleString('pt-BR')} ${ESTRELA}`;

  if (!faixa) {
    $('#info-faixa').textContent = `Mensagem a partir de ${faixas[0].minimo.toLocaleString('pt-BR')} moedas`;
    campoMensagem.disabled = true;
    campoMensagem.value = '';
    $('#contador').textContent = '';
    return;
  }
  $('#info-faixa').textContent = faixa.fixacaoMin ? duracao(faixa.fixacaoMin) : 'Sem fixação';
  campoMensagem.disabled = false;
  campoMensagem.maxLength = faixa.limite;
  if (campoMensagem.value.length > faixa.limite) campoMensagem.value = campoMensagem.value.slice(0, faixa.limite);
  $('#contador').textContent = `${campoMensagem.value.length}/${faixa.limite}`;
}

async function prepararFaixas() {
  faixas = await api('GET', '/api/faixas');
  slider.max = faixas.length - 1;
  $('#marcas').replaceChildren(...faixas.map(() => document.createElement('i')));
  campoValor.value = faixas[0].minimo;
  sincronizar();
}

slider.addEventListener('input', () => sincronizar('slider'));
// Roda do mouse rola as fixadas na horizontal.
$('#fixadas').addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });
campoValor.addEventListener('input', () => sincronizar());
campoMensagem.addEventListener('input', () => sincronizar());

$('#abrir-doacao').addEventListener('click', () => {
  if (estado.papel !== 'espectador') return avisar('Entre como espectador para doar.');
  if (!estado.live) return avisar('Não há live no ar.');
  const nome = nomeDoPapel(estado.papel);
  $('#previa-avatar').replaceWith(Object.assign(avatar(nome), { id: 'previa-avatar' }));
  $('#previa-autor').textContent = nome;
  sincronizar();
  $('#erro-doacao').hidden = true;
  dialogo.showModal();
});
$('#fechar-doacao').addEventListener('click', () => dialogo.close());

formDoacao.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!estado.live) return avisar('Não há live no ar.');
  const erro = $('#erro-doacao');
  erro.hidden = true;
  api('POST', `/api/lives/${estado.live.live}/doacoes`, { valor: Number(campoValor.value), mensagem: campoMensagem.value || undefined })
    .then(async () => {
      campoMensagem.value = '';
      dialogo.close();
      avisar('Doação enviada', true);
      await carregarOfertas();
    })
    .catch((e) => {
      erro.textContent = e.message;
      erro.hidden = false;
    });
});

// ---- chat ----
$('#form-chat').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!estado.live) return avisar('Não há live no ar.');
  const texto = new FormData(e.target).get('texto');
  tentar(async () => { await api('POST', `/api/lives/${estado.live.live}/chat`, { texto }); e.target.reset(); });
});

function cartaoDestacado(mensagem, tag) {
  const cartao = document.createElement(tag);
  cartao.className = `sc ${mensagem.cor ?? ''}`;
  const topo = document.createElement('div');
  topo.className = 'sc-topo';
  const autor = document.createElement('span');
  autor.className = 'autor';
  autor.textContent = mensagem.nomeAutor;
  const valor = document.createElement('strong');
  valor.innerHTML = `${mensagem.valor.toLocaleString('pt-BR')} ${ESTRELA}`;
  valor.setAttribute('aria-label', `${mensagem.valor.toLocaleString('pt-BR')} moedas`);
  topo.append(avatar(mensagem.nomeAutor), autor, valor);
  const texto = document.createElement('p');
  texto.textContent = mensagem.texto;
  cartao.append(topo, texto);
  return cartao;
}

function linhaComum(mensagem) {
  const li = document.createElement('li');
  li.className = 'linha';
  const nome = document.createElement('b');
  nome.textContent = mensagem.nomeAutor;
  const texto = document.createElement('span');
  texto.textContent = mensagem.texto;
  li.append(avatar(mensagem.nomeAutor), nome, texto);
  return li;
}

function fixar(mensagem) {
  const total = mensagem.tempoFixacaoMin * 60_000;
  const restante = Math.max(0, total - (Date.now() - new Date(mensagem.em).getTime()));
  const pilula = document.createElement('button');
  pilula.type = 'button';
  pilula.className = `pilula ${mensagem.cor ?? ''}`;
  pilula.setAttribute('aria-label', `Mensagem fixada de ${mensagem.nomeAutor}`);
  const dreno = document.createElement('i');
  dreno.className = 'dreno';
  dreno.style.animationDuration = `${total}ms`;
  dreno.style.animationDelay = `${restante - total}ms`;
  const valor = document.createElement('span');
  valor.textContent = mensagem.valor.toLocaleString('pt-BR');
  pilula.append(dreno, avatar(mensagem.nomeAutor), valor);

  const aberta = $('#fixada-aberta');
  pilula.addEventListener('click', () => {
    const mesma = aberta.dataset.id === mensagem.id && !aberta.hidden;
    aberta.hidden = mesma;
    aberta.dataset.id = mensagem.id;
    if (!mesma) {
      aberta.replaceChildren(cartaoDestacado(mensagem, 'div'));
      marcarCortados(aberta);
    }
  });
  // Maior valor primeiro; empate fica na ordem de chegada.
  pilula.dataset.valor = mensagem.valor;
  const ticker = $('#fixadas');
  const depois = [...ticker.children].find((p) => Number(p.dataset.valor) < mensagem.valor);
  ticker.insertBefore(pilula, depois ?? null);
  setTimeout(() => {
    pilula.remove();
    if (aberta.dataset.id === mensagem.id) aberta.hidden = true;
  }, restante);
}

// Popup com o nome completo quando o nome não coube.
const dica = Object.assign(document.createElement('div'), { id: 'dica', hidden: true });
document.body.append(dica);
document.addEventListener('mouseover', (e) => {
  const nome = e.target.closest?.('.autor.cortado, .linha b.cortado');
  if (!nome) return void (dica.hidden = true);
  dica.textContent = nome.textContent;
  dica.hidden = false;
  const caixa = nome.getBoundingClientRect();
  dica.style.left = `${Math.max(8, Math.min(caixa.left, innerWidth - dica.offsetWidth - 8))}px`;
  dica.style.top = `${caixa.top - dica.offsetHeight - 6}px`;
});

// Marca os nomes que não couberam, para esmaecer só esses.
function marcarCortados(raiz) {
  raiz.querySelectorAll('.autor, .linha b').forEach((el) => el.classList.toggle('cortado', el.scrollWidth > el.clientWidth));
}

function mostrarMensagem({ destacada, mensagem }) {
  const lista = $('#mensagens');
  const item = destacada ? cartaoDestacado(mensagem, 'li') : linhaComum(mensagem);
  lista.append(item);
  marcarCortados(item);
  lista.scrollTop = lista.scrollHeight;
  if (destacada && mensagem.tempoFixacaoMin > 0) fixar(mensagem);
}

function acompanharChat(live) {
  estado.fonte?.close();
  $('#mensagens').replaceChildren();
  $('#fixadas').replaceChildren();
  $('#fixada-aberta').hidden = true;
  estado.fonte = live ? new EventSource(`/api/lives/${live.live}/chat/stream`) : null;
  if (estado.fonte) estado.fonte.onmessage = (ev) => mostrarMensagem(JSON.parse(ev.data));
}

// ---- gravação (VOD) ----
const dialogoVod = $('#dialogo-vod');
const playerVod = $('#video-vod');

function abrirVod(vod, partes) {
  let atual = 0;
  const tocar = () => {
    playerVod.src = `/api/vods/${vod.live}/video/${partes[atual].parte}`;
    $('#info-vod').textContent = partes.length > 1 ? `Trecho ${atual + 1} de ${partes.length}` : '';
    playerVod.play().catch(() => {});
  };
  playerVod.onended = () => { if (++atual < partes.length) tocar(); };
  // Vídeo gravado pelo navegador chega sem duração; forçar um salto ao fim faz a barra de progresso funcionar.
  playerVod.onloadedmetadata = () => {
    if (playerVod.duration !== Infinity) return;
    playerVod.currentTime = 1e101;
    playerVod.addEventListener('timeupdate', () => { playerVod.currentTime = 0; }, { once: true });
  };
  $('#titulo-vod').textContent = vod.titulo;
  tocar();
  dialogoVod.showModal();
}
function fecharVod() {
  playerVod.pause();
  playerVod.removeAttribute('src');
  playerVod.load();
  dialogoVod.close();
}
$('#fechar-vod').addEventListener('click', fecharVod);
dialogoVod.addEventListener('cancel', () => { playerVod.pause(); });
dialogoVod.addEventListener('close', () => { playerVod.pause(); playerVod.removeAttribute('src'); });

// ---- lives no ar (visão do espectador) ----
function desenharLobby(lives) {
  const caixa = $('#lista-lives');
  const chave = JSON.stringify(lives.map((l) => [l.live, l.titulo]));
  if (caixa.dataset.chave === chave) return; // sem redesenho à toa: não engole cliques nem foco
  caixa.dataset.chave = chave;
  caixa.className = lives.length ? 'grade-lives' : 'grade-lives vazio';
  if (!lives.length) return void (caixa.textContent = 'Nenhuma live no ar agora. Quando um criador abrir uma live, ela aparece aqui.');
  caixa.replaceChildren(...lives.map((l) => {
    const cartao = document.createElement('button');
    cartao.type = 'button';
    cartao.className = 'cartao-live';
    const miniatura = document.createElement('div');
    miniatura.className = 'miniatura';
    miniatura.innerHTML = '<span class="selo-ao-vivo">Ao vivo</span><span>Assistir</span>';
    const conteudo = document.createElement('div');
    conteudo.className = 'conteudo';
    const titulo = document.createElement('strong');
    titulo.textContent = l.titulo;
    const quando = document.createElement('small');
    quando.textContent = `No ar desde ${new Date(l.iniciadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    conteudo.append(titulo, quando);
    cartao.append(miniatura, conteudo);
    cartao.addEventListener('click', () => tentar(async () => { estado.escolhida = l.live; await atualizar(); }));
    return cartao;
  }));
}
$('#voltar-lives').addEventListener('click', () => tentar(async () => { estado.escolhida = null; await atualizar(); }));

// ---- estado geral (live no ar e VODs) ----
async function atualizar() {
  const [lives, vods, gravacoes] = await Promise.all([api('GET', '/api/lives'), api('GET', '/api/vods'), api('GET', '/api/vods/gravacoes')]);
  const ehCriador = estado.papel === 'criador';
  // Criador vê a própria live (ou o formulário para abrir uma). Espectador (logado ou não) escolhe uma
  // na lista de lives no ar; se a escolhida acabou, volta para a lista.
  const nova = ehCriador
    ? lives.find((l) => l.criador === estado.usuario) ?? null
    : lives.find((l) => l.live === estado.escolhida) ?? null;
  if (!ehCriador && !nova) estado.escolhida = null;
  if (nova?.live !== estado.live?.live) acompanharChat(nova);
  estado.live = nova;
  video.sincronizar(nova);

  const noLobby = !ehCriador && !nova;
  $('#lobby').hidden = !noLobby;
  $('#player').hidden = noLobby;
  $('.barra-live').hidden = noLobby;
  $('#painel-chat').hidden = noLobby;
  $('.palco').classList.toggle('sem-chat', noLobby);
  if (noLobby) desenharLobby(lives);

  $('#no-ar').hidden = !nova;
  $('#sem-live').hidden = !!nova;
  $('#titulo-barra').textContent = nova?.titulo ?? '';
  $('#form-live').hidden = !ehCriador;
  $('#texto-sem-live').textContent = 'Abra sua live.';
  $('#voltar-lives').hidden = ehCriador || !nova;
  $('#encerrar').hidden = !(nova && ehCriador);

  const lista = $('#vods');
  const chaveVods = JSON.stringify([vods, gravacoes]);
  // Só redesenha quando algo mudou: refazer os cartões a cada atualização engoliria cliques.
  if (lista.dataset.chave !== chaveVods) {
  lista.dataset.chave = chaveVods;
  lista.className = vods.length ? 'grade-vod' : 'grade-vod vazio';
  if (!vods.length) lista.textContent = 'Nenhuma live encerrada ainda.';
  else lista.replaceChildren(...vods.map((v) => {
    const item = document.createElement('div');
    item.className = 'vod';
    const partes = gravacoes[v.live] ?? [];
    const capa = document.createElement(partes.length ? 'button' : 'div');
    capa.className = 'capa';
    if (partes.length) {
      capa.type = 'button';
      capa.setAttribute('aria-label', `Assistir a gravação de ${v.titulo}`);
      capa.innerHTML = '<span class="tocar"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>Assistir</span>';
      capa.addEventListener('click', () => abrirVod(v, partes));
    } else {
      capa.textContent = 'Sem vídeo gravado';
    }
    const titulo = document.createElement('strong');
    titulo.textContent = v.titulo;
    const hora = document.createElement('small');
    hora.textContent = `Encerrada às ${new Date(v.encerradaEm).toLocaleTimeString('pt-BR')}`;
    item.append(capa, titulo, hora);
    return item;
  }));
  }
  await carregarOfertas();
}

prepararFaixas().catch((e) => avisar(e.message));
atualizar().catch((e) => avisar(e.message));
setInterval(() => atualizar().catch(() => {}), 4000);
