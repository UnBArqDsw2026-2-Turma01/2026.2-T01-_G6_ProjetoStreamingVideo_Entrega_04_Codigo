import type { MensagemChat } from '@g6/shared-kernel';
import type { ModerationVerdict } from './ModerationVerdict.js';

export interface AutoModPipeline {
  inspectMessage(message: MensagemChat): ModerationVerdict;
}
