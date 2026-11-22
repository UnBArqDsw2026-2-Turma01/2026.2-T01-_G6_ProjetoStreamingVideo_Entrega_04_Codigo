import type {
  DecisaoModeracao,
  MensagemChat,
  ModeracaoPort,
  VereditoModeracao,
} from '@g6/shared-kernel';
import type { AutoModPipeline } from './moderation/AutoModPipeline.js';
import { AutoModPipelineConcreto } from './moderation/AutoModPipelineConcreto.js';
import { ModerationDecision } from './moderation/ModerationDecision.js';

function mapearDecisao(decisao: ModerationDecision): DecisaoModeracao {
  switch (decisao) {
    case ModerationDecision.APPROVED:
      return 'aprovada';
    case ModerationDecision.QUARANTINED:
      return 'quarentena';
    case ModerationDecision.REJECTED:
      return 'bloqueada';
  }
}

/** Implementa ModeracaoPort sobre o AutoModPipeline sem alterar a mensagem avaliada. */
export class ModeracaoService implements ModeracaoPort {
  constructor(private readonly pipeline: AutoModPipeline = new AutoModPipelineConcreto()) {}

  public async avaliar(mensagem: MensagemChat): Promise<VereditoModeracao> {
    const veredito = this.pipeline.inspectMessage(mensagem);
    return {
      decisao: mapearDecisao(veredito.decision),
      motivo: veredito.reason,
    };
  }
}
