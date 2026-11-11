import type { AutenticacaoPort } from '../../ports';
import type { Credenciais, FatorAdicional, Resultado, Sessao } from '../../tipos';
import { usuarioId } from '../../tipos';

export interface ChamadaAutenticacao {
  metodo: 'login' | 'stepUp';
  args: [Credenciais] | [Sessao, FatorAdicional];
  em: Date;
}

export class FakeAutenticacao implements AutenticacaoPort {
  readonly chamadas: ChamadaAutenticacao[] = [];
  proximoResultadoLogin?: Resultado<Sessao>;
  proximoResultadoStepUp?: Resultado<Sessao>;

  async login(credenciais: Credenciais): Promise<Resultado<Sessao>> {
    this.chamadas.push({ metodo: 'login', args: [credenciais], em: new Date() });
    if (this.proximoResultadoLogin) {
      return this.proximoResultadoLogin;
    }

    if (credenciais.senha === 'senha_invalida') {
      return {
        ok: false,
        erro: { codigo: 'CREDENCIAL_INVALIDA', mensagem: 'Credenciais incorretas' },
      };
    }

    return {
      ok: true,
      valor: {
        usuarioId: usuarioId('usr_fake_padrao'),
        papel: 'espectador',
        token: 'token_fake_login',
        expiraEm: new Date(Date.now() + 3600000),
      },
    };
  }

  async stepUp(sessao: Sessao, fator: FatorAdicional): Promise<Resultado<Sessao>> {
    this.chamadas.push({ metodo: 'stepUp', args: [sessao, fator], em: new Date() });
    if (this.proximoResultadoStepUp) {
      return this.proximoResultadoStepUp;
    }

    if (fator.codigo === '000000') {
      return {
        ok: false,
        erro: { codigo: 'FATOR_INVALIDO', mensagem: 'Código TOTP incorreto' },
      };
    }

    return {
      ok: true,
      valor: { ...sessao, expiraEm: new Date(Date.now() + 7200000) },
    };
  }
}