import type { MensagemChat } from '@g6/shared-kernel';
import type { TextAnalysisResult } from '../algorithms/TextEntropyAnalyzer.js';
import { ModerationDecision } from '../moderation/ModerationDecision.js';
import type { ModerationVerdict } from '../moderation/ModerationVerdict.js';

/** Regra intercambiável avaliada pelo AutoModPipelineConcreto (Strategy). */
export interface EstrategiaModeracao {
  readonly nome: string;
  avaliar(mensagem: MensagemChat, analise: TextAnalysisResult): ModerationVerdict | null;
}

export class EstrategiaToxicidade implements EstrategiaModeracao {
  public readonly nome = 'ToxicidadeLexica';

  public avaliar(_mensagem: MensagemChat, analise: TextAnalysisResult): ModerationVerdict | null {
    const termosToxicos = analise.detectedViolations.filter((v) => v.startsWith('TOXIC_TERM_'));
    if (analise.isToxic || termosToxicos.length > 0) {
      return {
        decision: ModerationDecision.REJECTED,
        reason: `Conteúdo ofensivo ou tóxico detectado (${termosToxicos.join(', ')})`,
      };
    }
    return null;
  }
}

export class EstrategiaPhishingELinks implements EstrategiaModeracao {
  public readonly nome = 'PhishingELinks';

  public avaliar(_mensagem: MensagemChat, analise: TextAnalysisResult): ModerationVerdict | null {
    if (analise.detectedViolations.includes('SUSPICIOUS_PHISHING_LINK')) {
      return {
        decision: ModerationDecision.REJECTED,
        reason: 'Link suspeito ou padrão de phishing detectado',
      };
    }
    if (analise.hasExternalLinks || analise.detectedViolations.includes('EXTERNAL_LINK_QUARANTINE')) {
      return {
        decision: ModerationDecision.QUARANTINED,
        reason: 'Link externo enviado para quarentena preventiva',
      };
    }
    return null;
  }
}

export class EstrategiaEntropiaEFlood implements EstrategiaModeracao {
  public readonly nome = 'EntropiaDeShannonEFlood';

  public avaliar(_mensagem: MensagemChat, analise: TextAnalysisResult): ModerationVerdict | null {
    const spamFlags = analise.detectedViolations.filter(
      (v) =>
        v === 'CHARACTER_FLOODING' ||
        v === 'LOW_ENTROPY_REPETITIVE_SPAM' ||
        v === 'HIGH_ENTROPY_RANDOM_HASH_SPAM'
    );
    if (spamFlags.length > 0) {
      return {
        decision: ModerationDecision.QUARANTINED,
        reason: `Anomalia de entropia ou repetição detectada (${spamFlags.join(', ')}, H=${analise.entropy})`,
      };
    }
    return null;
  }
}
