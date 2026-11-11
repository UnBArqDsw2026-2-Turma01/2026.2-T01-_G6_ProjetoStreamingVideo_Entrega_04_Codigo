/** Decisão da moderação (E03 SG3: `ModerationDecision`). */
export type DecisaoModeracao = 'aprovada' | 'quarentena' | 'bloqueada';

/** Decisão com o motivo, para auditoria e para avisar o autor (E03 SG3: `ModerationVerdict`). */
export interface VereditoModeracao {
  readonly decisao: DecisaoModeracao;
  readonly motivo: string;
}
