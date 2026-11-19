import type { MensagemChat } from '@g6/shared-kernel';
import { TextEntropyAnalyzer } from '../algorithms/TextEntropyAnalyzer.js';
import type { AutoModPipeline } from './AutoModPipeline.js';
import { ModerationDecision } from './ModerationDecision.js';
import type { ModerationVerdict } from './ModerationVerdict.js';
import {
  EstrategiaEntropiaEFlood,
  EstrategiaPhishingELinks,
  EstrategiaToxicidade,
  type EstrategiaModeracao,
} from '../strategy/EstrategiasModeracao.js';

export class AutoModPipelineConcreto implements AutoModPipeline {
  private readonly estrategias: EstrategiaModeracao[];

  constructor(
    estrategias: EstrategiaModeracao[] = [
      new EstrategiaToxicidade(),
      new EstrategiaPhishingELinks(),
      new EstrategiaEntropiaEFlood(),
    ]
  ) {
    this.estrategias = [...estrategias];
  }

  public definirEstrategias(estrategias: EstrategiaModeracao[]): void {
    this.estrategias.splice(0, this.estrategias.length, ...estrategias);
  }

  public inspectMessage(message: MensagemChat): ModerationVerdict {
    const analise = TextEntropyAnalyzer.analyze(message.texto);

    for (const estrategia of this.estrategias) {
      const veredito = estrategia.avaliar(message, analise);
      if (veredito !== null) {
        return veredito;
      }
    }

    return {
      decision: ModerationDecision.APPROVED,
      reason: 'Mensagem aprovada pelo AutoMod',
    };
  }
}
