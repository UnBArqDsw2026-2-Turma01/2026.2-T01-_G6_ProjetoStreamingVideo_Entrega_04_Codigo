import type { ModeracaoPort } from '../../ports';
import type { MensagemChat, VereditoModeracao } from '../../tipos';

export interface ChamadaModeracao {
  metodo: 'avaliar';
  args: [MensagemChat];
  em: Date;
}

export class FakeModeracao implements ModeracaoPort {
  readonly chamadas: ChamadaModeracao[] = [];
  proximoVeredito?: VereditoModeracao;

  async avaliar(mensagem: MensagemChat): Promise<VereditoModeracao> {
    this.chamadas.push({ metodo: 'avaliar', args: [mensagem], em: new Date() });
    
    if (this.proximoVeredito) {
      return this.proximoVeredito;
    }

    if (mensagem.texto.includes('palavrão') || mensagem.texto.includes('ofensa')) {
      return { decisao: 'bloqueada', motivo: 'Ofensa detectada' };
    }

    if (mensagem.texto.includes('http')) {
      return { decisao: 'quarentena', motivo: 'Link suspeito' };
    }

    return { decisao: 'aprovada', motivo: 'Limpo' };
  }
}