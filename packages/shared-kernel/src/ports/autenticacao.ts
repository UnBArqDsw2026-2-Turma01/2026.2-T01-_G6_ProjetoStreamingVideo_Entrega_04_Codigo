import type { Credenciais, FatorAdicional, Resultado, Sessao } from '../tipos';

/**
 * Autenticação de usuários.
 *
 * - **Provê:** `@g6/identidade` (Chain of Responsibility da E03).
 * - **Consome:** `apps/*`.
 * - **Garante:** uma `Sessao` só existe depois de a cadeia inteira aprovar o login;
 *   credencial errada, conta bloqueada e segundo fator ausente voltam como erro,
 *   nunca como exceção.
 */
export interface AutenticacaoPort {
  /** Autentica e emite a sessão. */
  login(credenciais: Credenciais): Promise<Resultado<Sessao>>;
  /**
   * Reautentica antes de uma ação sensível e devolve a sessão elevada.
   * A sessão original não é alterada.
   */
  stepUp(sessao: Sessao, fator: FatorAdicional): Promise<Resultado<Sessao>>;
}
