import type { DoacaoPort } from '../../ports';
import type { ComprovanteDoacao, LiveId, MoedaVirtual, Resultado, Sessao } from '../../tipos';

export interface ChamadaDoacao {
  metodo: 'doar';
  args: [Sessao, LiveId, MoedaVirtual, string | undefined];
  em: Date;
}

export class FakeDoacao implements DoacaoPort {
  readonly chamadas: ChamadaDoacao[] = [];
  proximoResultado?: Resultado<ComprovanteDoacao>;

  async doar(sessao: Sessao, live: LiveId, valor: MoedaVirtual, mensagem?: string): Promise<Resultado<ComprovanteDoacao>> {
    this.chamadas.push({ metodo: 'doar', args: [sessao, live, valor, mensagem], em: new Date() });
    
    if (this.proximoResultado) {
      return this.proximoResultado;
    }

    if (valor <= 0) {
        return { ok: false, erro: { codigo: 'VALOR_INVALIDO', mensagem: 'O valor da doação deve ser positivo' } };
    }

    return {
      ok: true,
      valor: {
        doacaoId: `doa_${Math.random().toString(36).substring(7)}`,
        live,
        doador: sessao.usuarioId,
        valor,
        destaqueEntregue: true,
        em: new Date(),
      }
    };
  }
}