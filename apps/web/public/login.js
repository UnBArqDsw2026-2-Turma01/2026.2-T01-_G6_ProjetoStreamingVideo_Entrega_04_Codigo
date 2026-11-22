// Executado sozinho no login e anexado ao módulo da página integrada por auth/index.ts.
const CHAVE_LOGIN = 'ca01.sessao';
function guardarLogin(sessao) { sessionStorage.setItem(CHAVE_LOGIN, JSON.stringify(sessao)); }
function lerLogin() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_LOGIN) || 'null'); }
  catch { sessionStorage.removeItem(CHAVE_LOGIN); return null; }
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
  // Intercepta os botões antes dos listeners da demo da #16.
  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-papel]');
    if (!botao) return;
    evento.preventDefault(); evento.stopImmediatePropagation();
    location.assign(`/login.html?papel=${encodeURIComponent(botao.dataset.papel)}`);
  }, true);
  const contaLogin = lerLogin();
  if (contaLogin) {
    requisicaoLogin('/api/sessao', undefined, contaLogin.token).then(async (sessao) => {
      guardarLogin(sessao);
      Object.assign(estado, { token: sessao.token, papel: sessao.papel });
      document.querySelector('#quem').textContent = `Sessão: ${sessao.papel}`;
      await atualizar();
    }).catch(() => { sessionStorage.removeItem(CHAVE_LOGIN); avisar('Sessão expirada. Entre novamente.'); });
  }
  const confirmarLogin = document.createElement('a');
  confirmarLogin.href = '/login.html?acao=step-up'; confirmarLogin.textContent = 'Confirmar identidade';
  document.querySelector('.sessao').append(confirmarLogin);
  const sairLogin = document.createElement('button');
  sairLogin.textContent = 'Sair'; sairLogin.className = 'sec';
  sairLogin.addEventListener('click', () => { sessionStorage.removeItem(CHAVE_LOGIN); location.reload(); });
  document.querySelector('.sessao').append(sairLogin);
}
