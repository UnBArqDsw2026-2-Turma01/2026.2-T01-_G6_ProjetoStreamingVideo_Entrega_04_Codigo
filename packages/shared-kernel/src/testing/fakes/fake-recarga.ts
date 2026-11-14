import type { RecargaPort } from '../../ports';
import type {
  CheckoutPendente,
  ErroRecarga,
  MeioPagamento,
  OfertaRecarga,
  PacoteId,
  Resultado,
  Sessao,
  SituacaoRecarga,
  UsuarioId,
} from '../../tipos';
import { pacoteId } from '../../tipos';

export interface ChamadaRecarga {
  metodo: 'ofertas' | 'recarregar' | 'consultar';
  args: [Sessao] | [Sessao, PacoteId, MeioPagamento] | [Sessao, string];
  em: Date;
}

interface RegistroRecarga {
  usuarioId: UsuarioId;
  situacao: SituacaoRecarga;
}

export class FakeRecarga implements RecargaPort {
  readonly chamadas: ChamadaRecarga[] = [];
  readonly recargas = new Map<string, RegistroRecarga>();
  ofertasDisponiveis: OfertaRecarga[] = [
    {
      pacote: pacoteId('pct_valido'),
      moeda: 100,
      precoSemDescontoCentavos: 1000,
      precoCentavos: 900,
      descontoPercentual: 10,
      composicao: 'pacote de 100 (R$ 10,00) → desconto de 10%',
    },
  ];
  proximoResultadoRecarregar?: Resultado<CheckoutPendente, ErroRecarga>;

  async ofertas(sessao: Sessao): Promise<Resultado<OfertaRecarga[]>> {
    this.chamadas.push({ metodo: 'ofertas', args: [sessao], em: new Date() });
    return { ok: true, valor: [...this.ofertasDisponiveis] };
  }

  async recarregar(
    sessao: Sessao,
    pacote: PacoteId,
    meio: MeioPagamento,
  ): Promise<Resultado<CheckoutPendente, ErroRecarga>> {
    this.chamadas.push({ metodo: 'recarregar', args: [sessao, pacote, meio], em: new Date() });

    if (this.proximoResultadoRecarregar) {
      return this.proximoResultadoRecarregar;
    }

    if (pacote === 'pct_invalido') {
      return {
        ok: false,
        erro: { codigo: 'PACOTE_INVALIDO', mensagem: 'Pacote inexistente' },
      };
    }

    const recargaId = `rec_${Math.random().toString(36).substring(7)}`;
    const checkout: CheckoutPendente = {
      recargaId,
      pacote,
      meio,
      valorCobradoCentavos: 900,
      moedaACreditar: 100,
      instrucoes: meio === 'simulado' ? 'Confirmar pagamento simulado' : `https://checkout.fake/${recargaId}`,
    };

    this.recargas.set(recargaId, {
      usuarioId: sessao.usuarioId,
      situacao: { situacao: 'pendente', checkout },
    });

    return { ok: true, valor: checkout };
  }

  async consultar(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>> {
    this.chamadas.push({ metodo: 'consultar', args: [sessao, recargaId], em: new Date() });

    const registro = this.recargas.get(recargaId);
    if (!registro || registro.usuarioId !== sessao.usuarioId) {
      return {
        ok: false,
        erro: { codigo: 'RECARGA_NAO_ENCONTRADA', mensagem: 'Recarga inexistente ou pertence a outro usuário' },
      };
    }

    return { ok: true, valor: registro.situacao };
  }

  confirmar(recargaId: string): void {
    const registro = this.recargas.get(recargaId);
    if (!registro || registro.situacao.situacao !== 'pendente') {
      return;
    }

    const { checkout } = registro.situacao;
    registro.situacao = {
      situacao: 'concluida',
      recibo: {
        recargaId: checkout.recargaId,
        pacote: checkout.pacote,
        moedaCreditada: checkout.moedaACreditar,
        valorCobradoCentavos: checkout.valorCobradoCentavos,
        meio: checkout.meio,
        em: new Date(),
      },
    };
  }
}