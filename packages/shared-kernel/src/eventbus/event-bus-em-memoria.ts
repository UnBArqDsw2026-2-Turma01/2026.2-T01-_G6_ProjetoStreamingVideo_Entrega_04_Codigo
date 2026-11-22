import type { Cancelamento } from '../tipos';
import type { EventBus, EventoDe, EventoDominio, TipoEvento } from '../eventos';

/**
 * Implementação em memória do barramento de eventos de domínio.
 *
 * - **Garante:** entrega síncrona, em ordem de inscrição, com proteção contra
 *   reentrância (fila de despacho para eventos publicados durante o tratamento de outro).
 * - **Falhas:** um tratador que lança não impede a entrega aos demais nem trava a fila;
 *   ao fim do despacho, as falhas voltam juntas ao publicador como `AggregateError`.
 */
export class EventBusEmMemoria implements EventBus {
  private readonly tratadores = new Map<TipoEvento, Array<(evento: any) => void>>();
  private readonly fila: EventoDominio[] = [];
  private emProcessamento = false;

  publicar(evento: EventoDominio): void {
    this.fila.push(evento);

    if (this.emProcessamento) {
      return;
    }

    this.emProcessamento = true;
    const falhas: unknown[] = [];
    try {
      while (this.fila.length > 0) {
        const proximo = this.fila.shift()!;
        const lista = this.tratadores.get(proximo.tipo) ?? [];
        for (const tratador of [...lista]) {
          // Um tratador que falha não impede os demais nem trava a fila.
          try {
            tratador(proximo);
          } catch (erro) {
            falhas.push(erro);
          }
        }
      }
    } finally {
      this.emProcessamento = false;
    }
    if (falhas.length > 0) {
      throw new AggregateError(falhas, `${falhas.length} tratador(es) falharam ao receber eventos`);
    }
  }

  assinar<T extends TipoEvento>(tipo: T, tratador: (evento: EventoDe<T>) => void): Cancelamento {
    const lista = this.tratadores.get(tipo) ?? [];
    lista.push(tratador);
    this.tratadores.set(tipo, lista);

    let cancelado = false;
    return () => {
      if (cancelado) return;
      cancelado = true;
      const atuais = this.tratadores.get(tipo) ?? [];
      const filtrados = atuais.filter((t) => t !== tratador);
      if (filtrados.length > 0) {
        this.tratadores.set(tipo, filtrados);
      } else {
        this.tratadores.delete(tipo);
      }
    };
  }
}
