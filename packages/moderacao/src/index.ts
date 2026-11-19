// Contexto de moderação (AutoMod + Strategy) · ModeracaoPort.
// Ponto de entrada público do pacote: exporte aqui só o que outros módulos podem usar.
export { ModeracaoService } from './ModeracaoService.js';
export { AutoModPipelineConcreto } from './moderation/AutoModPipelineConcreto.js';
export type { AutoModPipeline } from './moderation/AutoModPipeline.js';
export { ModerationDecision } from './moderation/ModerationDecision.js';
export type { ModerationVerdict } from './moderation/ModerationVerdict.js';
export {
  EstrategiaToxicidade,
  EstrategiaPhishingELinks,
  EstrategiaEntropiaEFlood,
  type EstrategiaModeracao,
} from './strategy/EstrategiasModeracao.js';
export { TextEntropyAnalyzer, type TextAnalysisResult } from './algorithms/TextEntropyAnalyzer.js';
