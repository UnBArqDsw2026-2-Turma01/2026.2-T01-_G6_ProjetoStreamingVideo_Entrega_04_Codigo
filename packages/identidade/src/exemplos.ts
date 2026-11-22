import { Account, AccountStatus } from './autenticacao/dominio/account';
import { Credential } from './autenticacao/dominio/credential';
import { TwoFactorAuth, generateTotp } from './autenticacao/dominio/two-factor-auth';
import { criarAutenticacao } from './autenticacao-service';

/** Dados públicos de demonstração. Cada chamada cria contas e estado TOTP próprios. */
export function criarAutenticacaoExemplo() {
  const segredo = Buffer.from('segredo-publico-demo-ca01');
  const senha = 'Exemplo-CA01!';
  const contas = [
    new Account({ id: 'criador-ca01', email: 'criador@ca01.test', role: 'CREATOR',
      status: AccountStatus.ACTIVE, credential: Credential.fromPlainText(senha),
      twoFactor: new TwoFactorAuth(segredo) }),
    new Account({ id: 'espectador-ca01', email: 'espectador@ca01.test', role: 'VIEWER',
      status: AccountStatus.ACTIVE, credential: Credential.fromPlainText(senha) }),
  ];
  return { autenticacao: criarAutenticacao(contas), senha,
    codigoCriador: (agora = new Date()) => generateTotp(segredo, agora) };
}
