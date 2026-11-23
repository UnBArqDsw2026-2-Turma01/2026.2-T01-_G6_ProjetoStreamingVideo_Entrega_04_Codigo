// Executado sozinho no login e anexado ao módulo da página integrada por auth/index.ts.
// Persistência: as sessões ficam em localStorage, uma por papel, para sobreviver a recarga, nova aba
// e reinício do navegador. A aba lembra o papel ativo em sessionStorage, então criador e espectador
// podem estar abertos lado a lado. Senha e TOTP nunca são armazenados.
const CHAVE_SESSOES = 'ca01.sessoes';
const CHAVE_PAPEL_ABA = 'ca01.papel';
const CHAVE_ULTIMO_PAPEL = 'ca01.ultimo';
function lerJson(armazenamento, chave, padrao) {
  try { return JSON.parse(armazenamento.getItem(chave) || 'null') ?? padrao; }
  catch { try { armazenamento.removeItem(chave); } catch { /* ignora */ } return padrao; }
}
const vigente = (sessao) => !!sessao?.token && new Date(sessao.expiraEm).getTime() > Date.now();
function lerSessoes() { return lerJson(localStorage, CHAVE_SESSOES, {}); }
function guardarLogin(sessao) {
  const sessoes = lerSessoes();
  sessoes[sessao.papel] = sessao;
  localStorage.setItem(CHAVE_SESSOES, JSON.stringify(sessoes));
  localStorage.setItem(CHAVE_ULTIMO_PAPEL, sessao.papel);
  sessionStorage.setItem(CHAVE_PAPEL_ABA, sessao.papel);
}
function sessaoDoPapel(papel) {
  const sessao = lerSessoes()[papel];
  return vigente(sessao) ? sessao : null;
}
function esquecerLogin(papel) {
  const sessoes = lerSessoes();
  delete sessoes[papel];
  localStorage.setItem(CHAVE_SESSOES, JSON.stringify(sessoes));
  if (localStorage.getItem(CHAVE_ULTIMO_PAPEL) === papel) localStorage.removeItem(CHAVE_ULTIMO_PAPEL);
  sessionStorage.removeItem(CHAVE_PAPEL_ABA);
}
/** Sessão desta aba: o papel escolhido nela ou, numa aba nova, o último papel usado. */
function lerLogin() {
  const papel = sessionStorage.getItem(CHAVE_PAPEL_ABA) || localStorage.getItem(CHAVE_ULTIMO_PAPEL);
  return papel ? sessaoDoPapel(papel) : null;
}
async function requisicaoLogin(caminho, corpo, token) {
  const resposta = await fetch(caminho, { method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.mensagem || 'Não foi possível autenticar.');
  return dados;
}
const formularioLogin = document.querySelector('#form-login');
if (formularioLogin) {
  const confirmar = new URLSearchParams(location.search).get('acao') === 'step-up';
  if (confirmar) {
    document.querySelector('#titulo-login').textContent = 'Confirmar identidade';
    document.querySelector('#descricao-login').textContent = 'Confirme sua sessão com um novo código do autenticador.';
    document.querySelector('#credenciais-login').hidden = true;
    formularioLogin.elements.email.disabled = true;
    formularioLogin.elements.senha.disabled = true;
    formularioLogin.elements.codigoTotp.required = true;
    document.querySelector('#enviar-login').textContent = 'Confirmar';
  } else {
    const papel = new URLSearchParams(location.search).get('papel');
    if (papel === 'criador' || papel === 'espectador') formularioLogin.elements.email.value = `${papel}@ca01.test`;
  }
  formularioLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = document.querySelector('#enviar-login');
    const aviso = document.querySelector('#aviso-login');
    botao.disabled = true; aviso.textContent = ''; aviso.className = '';
    try {
      const dados = Object.fromEntries(new FormData(formularioLogin));
      const anterior = lerLogin();
      if (confirmar && !anterior) throw new Error('Entre na plataforma antes de confirmar sua identidade.');
      if (!dados.codigoTotp) delete dados.codigoTotp;
      const sessao = await requisicaoLogin(confirmar ? '/api/step-up' : '/api/login',
        confirmar ? { codigo: dados.codigoTotp } : dados, anterior?.token);
      guardarLogin(sessao);
      formularioLogin.reset();
      if (confirmar) { aviso.className = 'ok'; aviso.textContent = 'Identidade confirmada. Você pode voltar à transmissão.'; }
      else location.assign('/');
    } catch (erro) { aviso.textContent = erro.message; }
    finally { botao.disabled = false; }
  });
} else {
  const pagina = document.querySelector('.sessao');
  async function entrarComSessao(sessao) {
    const atual = await requisicaoLogin('/api/sessao', undefined, sessao.token);
    guardarLogin({ ...atual, token: sessao.token });
    Object.assign(estado, { token: sessao.token, papel: atual.papel });
    document.querySelector('#quem').textContent = `Sessão: ${atual.papel}`;
    document.querySelectorAll('[data-papel]').forEach((b) => b.classList.toggle('ativo', b.dataset.papel === atual.papel));
    await atualizar();
  }
  // Intercepta os botões antes dos listeners da demo da #16: reaproveita a sessão guardada do papel
  // ou leva ao login.
  document.addEventListener('click', async (evento) => {
    const botao = evento.target.closest('[data-papel]');
    if (!botao) return;
    evento.preventDefault(); evento.stopImmediatePropagation();
    const guardada = sessaoDoPapel(botao.dataset.papel);
    if (guardada) {
      try { await entrarComSessao(guardada); return; }
      catch { esquecerLogin(botao.dataset.papel); }
    }
    location.assign(`/login.html?papel=${encodeURIComponent(botao.dataset.papel)}`);
  }, true);
  const contaLogin = lerLogin();
  if (contaLogin) {
    entrarComSessao(contaLogin).catch(() => { esquecerLogin(contaLogin.papel); avisar('Sessão expirada. Entre novamente.'); });
  }
  const confirmarLogin = document.createElement('a');
  confirmarLogin.href = '/login.html?acao=step-up'; confirmarLogin.textContent = 'Confirmar identidade';
  pagina.append(confirmarLogin);
  const sairLogin = document.createElement('button');
  sairLogin.textContent = 'Sair'; sairLogin.className = 'sec';
  sairLogin.addEventListener('click', () => {
    const atual = lerLogin();
    if (atual) esquecerLogin(atual.papel);
    location.reload();
  });
  pagina.append(sairLogin);
}
