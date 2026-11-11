import type { UsuarioId } from './ids';

/** Papel do usuário na plataforma. O criador é quem pode abrir live. */
export type Papel = 'espectador' | 'criador' | 'moderador';

/**
 * Sessão autenticada, emitida por `AutenticacaoPort`. É o que os demais ports
 * recebem para saber quem está agindo; nenhum pacote revalida o token.
 */
export interface Sessao {
  readonly usuarioId: UsuarioId;
  readonly papel: Papel;
  readonly token: string;
  readonly expiraEm: Date;
}

/**
 * Dados do login (E03 SG3: `AuthenticationRequest`).
 * `codigoTotp` é exigido de quem tem segundo fator ativo (criadores, conflito C03).
 */
export interface Credenciais {
  readonly email: string;
  readonly senha: string;
  readonly codigoTotp?: string;
}

/**
 * Fator pedido na reautenticação antes de uma ação sensível
 * (E03 SG3: cadeia de step-up, concluída com TOTP).
 */
export interface FatorAdicional {
  readonly tipo: 'totp';
  readonly codigo: string;
}
