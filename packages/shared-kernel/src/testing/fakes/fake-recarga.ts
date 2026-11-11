import type { RecargaPort } from '../../ports';
import type { MeioPagamento, PacoteId, Recibo, Resultado, Sessao } from '../../tipos';

export interface ChamadaRecarga {
  metodo: 'recarregar';
  args: [Sessao, PacoteId, MeioPagamento];
  em: Date;
}

export class FakeRecarga implements RecargaPort {
  readonly chamadas: ChamadaRecarga[] = [];
  proximoResultado?: Resultado<Recibo>;

  async recarregar(sessao: Sessao, pacote: PacoteId, meio: MeioPagamento): Promise<Resultado<Recibo>> {
    this.chamadas.push({ metodo: 'recarregar', args: [sessao, pacote, meio], em: new Date() });
    
    if (this.proximoResultado) {
      return this.proximoResultado;
    }

    if (meio === 'simulado' && pacote === 'pct_invalido') {
        return { ok: false, erro: { codigo: 'PACOTE_INVALIDO', mensagem: 'Pacote inexistente' } };
    }

    return {
      ok: true,
      valor: {
        recargaId: `rec_${Math.random().toString(36).substring(7)}`,
        pacote,
        moedaCreditada: 100,
        valorCobradoCentavos: 500,
        meio,
        em: new Date(),
      }
    };
  }
}