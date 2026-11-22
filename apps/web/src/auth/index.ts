import { readFile } from 'node:fs/promises';
import { criarAutenticacaoExemplo } from '@g6/identidade';
import type { AutenticacaoPort, Resultado, Sessao } from '@g6/shared-kernel';
import type { RegistrarRotas } from '../rotas';
import type { Resposta } from '../http/app';

const erro = (status: number, codigo: string, mensagem: string): Resposta => ({ status, corpo: { codigo, mensagem } });
const campo = (corpo: unknown, chave: string): unknown =>
  corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>)[chave] : undefined;
const sessaoPublica = (s: Sessao) => ({ token: s.token, papel: s.papel, usuario: s.usuarioId, expiraEm: s.expiraEm });

/** Permite testar o HTTP contra um port injetado; a aplicação padrão usa a cadeia real. */
export function criarRegistroAutenticacao(autenticacao: AutenticacaoPort): RegistrarRotas {
  return (app, ctx) => {
    const responder = (r: Resultado<Sessao>): Resposta => {
      if (!r.ok) return erro(r.erro.codigo === 'RATE_LIMITED' ? 429 : 401,
        r.erro.codigo, r.erro.codigo === 'TOTP_REQUIRED' ? 'Informe o código do autenticador.' : 'Não foi possível autenticar. Confira seus dados.');
      ctx.emitirSessao(r.valor);
      return { status: 200, corpo: sessaoPublica(r.valor) };
    };
    app.rota('POST', '/api/login', async (req) => {
      const email = campo(req.corpo, 'email');
      const senha = campo(req.corpo, 'senha');
      const codigoTotp = campo(req.corpo, 'codigoTotp');
      if (typeof email !== 'string' || !email.trim() || email.length > 254 ||
          typeof senha !== 'string' || !senha || senha.length > 1024 ||
          (codigoTotp !== undefined && (typeof codigoTotp !== 'string' || !/^\d{6}$/.test(codigoTotp))))
        return erro(400, 'ENTRADA_INVALIDA', 'Informe e-mail, senha e, quando necessário, código de seis dígitos.');
      return responder(await autenticacao.login({ email, senha, codigoTotp: codigoTotp as string | undefined }));
    });
    app.rota('POST', '/api/step-up', async (req) => {
      const sessao = ctx.sessaoDe(req);
      if (!sessao) return erro(401, 'NAO_AUTENTICADO', 'Entre novamente para confirmar sua identidade.');
      const codigo = campo(req.corpo, 'codigo');
      if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo))
        return erro(400, 'ENTRADA_INVALIDA', 'Informe o código de seis dígitos.');
      return responder(await autenticacao.stepUp(sessao, { tipo: 'totp', codigo }));
    });
    app.rota('GET', '/api/sessao', (req) => {
      const sessao = ctx.sessaoDe(req);
      return sessao ? { status: 200, corpo: sessaoPublica(sessao) }
        : erro(401, 'NAO_AUTENTICADO', 'Entre novamente.');
    });

    // A #17 só pode editar auth/** e login.*: o ponto de extensão serve a ponte
    // no mesmo módulo de app.js, sem alterar o código da página da #16 no disco.
    app.rota('GET', '/app.js', async () => {
      const original = await readFile(new URL('../../public/app.js', import.meta.url), 'utf8');
      const ponte = await readFile(new URL('../../public/login.js', import.meta.url), 'utf8');
      return { fluxo: (res) => {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        res.end(original + '\n' + ponte);
      } };
    });
  };
}

export const registrarRotas: RegistrarRotas = (app, ctx) => {
  const { autenticacao } = criarAutenticacaoExemplo();
  criarRegistroAutenticacao(autenticacao)(app, ctx);
};
