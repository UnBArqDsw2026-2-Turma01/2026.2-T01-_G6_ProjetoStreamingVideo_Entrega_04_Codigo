import { randomBytes, randomUUID } from 'node:crypto';
import type { AutenticacaoPort, Credenciais, FatorAdicional, Resultado, Sessao } from '@g6/shared-kernel';
import { usuarioId } from '@g6/shared-kernel';
import { buildLoginChain, buildStepUpChain, type AuthenticationDependencies } from './autenticacao/cadeia/authentication-chains';
import { AuthenticationContext } from './autenticacao/cadeia/authentication-context';
import { RateLimitHandler } from './autenticacao/cadeia/rate-limit-handler';
import { AccountStatusHandler } from './autenticacao/cadeia/account-status-handler';
import { TwoFactorHandler } from './autenticacao/cadeia/two-factor-handler';
import { StepUpGrantHandler } from './autenticacao/cadeia/step-up-grant-handler';
import { Account, InMemoryAccountRepository } from './autenticacao/dominio/account';
import { HmacTokenService, InMemorySessionStore, type Session } from './autenticacao/dominio/session';
import { InMemoryAuditLogger, type AuditLogger, SecurityEventType } from './autenticacao/dominio/audit-log';
import { LeakedPasswordBloomFilter } from './autenticacao/dominio/leaked-password-bloom-filter';
import { LoginRateLimiter } from './autenticacao/dominio/login-rate-limiter';
import { solveProofOfWork } from './autenticacao/dominio/client-integrity-attestation';
import { StepUpAuthChallenge } from './autenticacao/dominio/step-up-auth-challenge';
import { LoginService } from './autenticacao/login-service';

export interface OpcoesAutenticacao {
  dependencias: AuthenticationDependencies;
  relogio?: () => Date;
  auditoria?: AuditLogger;
}

/** Adapta a cadeia da E03 ao contrato congelado, com sessões locais ao processo. */
export class AutenticacaoService implements AutenticacaoPort {
  readonly #deps: AuthenticationDependencies;
  readonly #clock: () => Date;
  readonly #audit: AuditLogger;
  readonly #login: LoginService;
  readonly #emitidas = new Map<string, { conta: Account; sessao: Session; publica: Sessao }>();

  constructor(opcoes: OpcoesAutenticacao) {
    this.#deps = opcoes.dependencias;
    this.#clock = opcoes.relogio ?? (() => new Date());
    this.#audit = opcoes.auditoria ?? new InMemoryAuditLogger();
    this.#login = new LoginService({ loginChain: buildLoginChain(this.#deps),
      stepUpChain: buildStepUpChain(this.#deps), audit: this.#audit, clock: this.#clock });
  }

  async login(credenciais: Credenciais): Promise<Resultado<Sessao>> {
    const now = this.#clock();
    const difficulty = this.#deps.clientIntegrity?.minDifficulty ?? 3;
    const challenge = randomUUID();
    // O port não transporta metadados HTTP. Atestação local serve só à demo,
    // não representa proteção contra automação de um cliente remoto.
    const request = {
      email: credenciais.email, password: credenciais.senha,
      totpCode: credenciais.codigoTotp, clientIp: 'local', userAgent: '@g6/identidade',
      attestation: { challenge, difficulty, issuedAt: now, hasWebDriverFlag: false,
        proofOfWorkNonce: solveProofOfWork(challenge, difficulty) },
    };
    const outcome = this.#login.login(request);
    if (outcome.status !== 'AUTHENTICATED') {
      return this.#erro(outcome.status === 'REJECTED' ? outcome.reason : 'TOTP_REQUIRED');
    }
    const publica: Sessao = { usuarioId: usuarioId(outcome.account.id),
      papel: outcome.account.role === 'CREATOR' ? 'criador' : 'espectador',
      token: outcome.accessToken, expiraEm: new Date(outcome.session.expiresAt) };
    this.#emitidas.set(publica.token, { conta: outcome.account, sessao: outcome.session,
      publica: { ...publica, expiraEm: new Date(publica.expiraEm) } });
    return { ok: true, valor: publica };
  }

  async stepUp(sessao: Sessao, fator: FatorAdicional): Promise<Resultado<Sessao>> {
    const now = this.#clock();
    const registro = this.#emitidas.get(sessao.token);
    if (!registro || registro.sessao.isRevoked || registro.sessao.isExpired(now) ||
        registro.publica.usuarioId !== sessao.usuarioId || registro.publica.papel !== sessao.papel ||
        registro.publica.expiraEm.getTime() !== sessao.expiraEm.getTime() ||
        !this.#deps.tokens.verify(sessao.token, now)) return this.#erro('SESSAO_INVALIDA');
    if (fator.tipo !== 'totp') return this.#erro('FATOR_INVALIDO');
    // O contrato já comprova o primeiro fator pela sessão emitida. Não guarda senha.
    const head = new RateLimitHandler(this.#deps.rateLimiter);
    head.setNext(new AccountStatusHandler()).setNext(new TwoFactorHandler({ alwaysRequire: true }))
      .setNext(new StepUpGrantHandler());
    const ctx = new AuthenticationContext({ email: registro.conta.email, password: '',
      clientIp: registro.sessao.ipAddress, userAgent: registro.sessao.userAgent,
      totpCode: fator.codigo, stepUpChallenge: new StepUpAuthChallenge({ id: randomUUID(),
        accountId: registro.conta.id, trigger: 'WALLET_PAYOUT_REQUEST',
        expiresAt: registro.sessao.expiresAt }) }, now);
    ctx.account = registro.conta;
    const outcome = head.handle(ctx);
    this.#audit.log({ eventType: outcome.status === 'STEP_UP_GRANTED'
      ? SecurityEventType.STEP_UP_CHALLENGE_SUCCESS : SecurityEventType.STEP_UP_CHALLENGE_FAILED,
      targetEmail: registro.conta.email, ipAddress: registro.sessao.ipAddress,
      timestamp: now, metadata: { status: outcome.status } });
    if (outcome.status !== 'STEP_UP_GRANTED')
      return this.#erro(outcome.status === 'REJECTED' ? outcome.reason : 'TOTP_REQUIRED');
    return { ok: true, valor: { ...registro.publica, expiraEm: new Date(registro.publica.expiraEm) } };
  }

  #erro(codigo: string): Resultado<never> {
    return { ok: false, erro: { codigo, mensagem: 'Autenticação recusada: ' + codigo } };
  }
}

/** Montagem sem dependências de outros contextos; chaves aleatórias por instância. */
export function criarAutenticacao(contas: readonly Account[], opcoes: {
  relogio?: () => Date; auditoria?: AuditLogger;
} = {}): AutenticacaoService {
  return new AutenticacaoService({ ...opcoes, dependencias: {
    accounts: new InMemoryAccountRepository(contas), rateLimiter: new LoginRateLimiter(),
    leakedPasswords: LeakedPasswordBloomFilter.fromList(['senha123', '123456']),
    sessions: new InMemorySessionStore(), tokens: new HmacTokenService(randomBytes(32)),
  } });
}
