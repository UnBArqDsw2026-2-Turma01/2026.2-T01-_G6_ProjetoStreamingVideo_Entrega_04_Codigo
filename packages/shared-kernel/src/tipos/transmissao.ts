import type { CanalId, LiveId, UsuarioId } from './ids';

/**
 * Pedido de abertura de live por preset (E03 SG1: receitas do `StreamConfigDirector`).
 * O título é o único dado livre; o restante da configuração vem do preset.
 */
export interface PresetTransmissao {
  readonly preset: 'baixa-latencia' | 'alta-qualidade' | 'movel';
  readonly titulo: string;
}

/**
 * O que os outros módulos precisam saber de uma live no ar.
 * `canal` é onde ela acontece; `criador` é a conta que a abriu e que recebe as doações.
 */
export interface LiveResumo {
  readonly live: LiveId;
  readonly canal: CanalId;
  readonly criador: UsuarioId;
  readonly titulo: string;
  readonly iniciadaEm: Date;
}
