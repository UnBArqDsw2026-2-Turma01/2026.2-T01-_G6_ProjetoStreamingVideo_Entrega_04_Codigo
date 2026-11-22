export { AutenticacaoService, criarAutenticacao, type OpcoesAutenticacao } from './autenticacao-service';
export { criarAutenticacaoExemplo } from './exemplos';
export { Account, AccountStatus, InMemoryAccountRepository } from './autenticacao/dominio/account';
export { Credential } from './autenticacao/dominio/credential';
export { TwoFactorAuth, generateTotp } from './autenticacao/dominio/two-factor-auth';
