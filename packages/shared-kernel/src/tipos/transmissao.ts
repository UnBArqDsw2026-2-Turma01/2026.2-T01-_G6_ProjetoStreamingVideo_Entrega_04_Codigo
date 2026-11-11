import type { CanalId, LiveId } from './ids';

/**
 * Pedido de abertura de live por preset (E03 SG1: receitas do `StreamConfigDirector`).
 * O título é o único dado livre; o restante da configuração vem do preset.
 */
export interface PresetTransmissao {
  readonly preset: 'baixa-latencia' | 'alta-qualidade' | 'movel';
  readonly titulo: string;
}

/** O que os apps precisam saber de uma live aberta. */
export interface LiveResumo {
  readonly live: LiveId;
  readonly canal: CanalId;
  readonly titulo: string;
  readonly iniciadaEm: Date;
}
