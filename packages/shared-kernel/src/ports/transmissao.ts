import type { LiveId, LiveResumo, PresetTransmissao, Resultado, Sessao } from '../tipos';

/**
 * Ciclo de vida da live.
 *
 * - **Provê:** `@g6/transmissao` (Builder + Director na configuração, Observer no canal).
 * - **Consome:** `apps/*` e `@g6/monetizacao` (a doação consulta quem é o criador da live).
 * - **Garante:** só sessão com papel `criador` abre live; abrir publica `LiveIniciada`
 *   e encerrar publica `LiveEncerrada` no `EventBus`, uma vez cada. É a única fonte
 *   de "esta live é de tal criador": nenhum outro módulo guarda essa relação.
 */
export interface TransmissaoPort {
  /** Monta a configuração pelo preset e coloca a live no ar. */
  abrir(criador: Sessao, preset: PresetTransmissao): Promise<Resultado<LiveResumo>>;
  /** Encerra a live. Só o criador que a abriu pode encerrar. */
  encerrar(criador: Sessao, live: LiveId): Promise<Resultado<void>>;
  /** Dados de uma live no ar. Live inexistente ou já encerrada volta como erro. */
  consultar(live: LiveId): Promise<Resultado<LiveResumo>>;
}
