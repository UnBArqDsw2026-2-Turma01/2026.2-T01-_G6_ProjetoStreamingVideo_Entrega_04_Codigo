import type { ChatPort } from '../../ports';
import type { Cancelamento, LiveId, MensagemChat, MensagemDestacada, MensagemEntregue, Resultado } from '../../tipos';

export interface ChamadaChat {
  metodo: 'publicar' | 'publicarDestacada' | 'inscrever';
  args: [LiveId, MensagemChat] | [LiveId, MensagemDestacada] | [LiveId, (mensagem: MensagemEntregue) => void];
  em: Date;
}

export class FakeChat implements ChatPort {
  readonly chamadas: ChamadaChat[] = [];
  readonly ouvintes = new Map<string, Array<(m: MensagemEntregue) => void>>();

  async publicar(live: LiveId, mensagem: MensagemChat): Promise<Resultado<void>> {
    this.chamadas.push({ metodo: 'publicar', args: [live, mensagem], em: new Date() });
    
    const inscritos = this.ouvintes.get(live) ?? [];
    const entregue: MensagemEntregue = { live, destacada: false, mensagem };
    
    for (const ouvinte of inscritos) {
      ouvinte(entregue);
    }
    
    return { ok: true, valor: undefined };
  }

  async publicarDestacada(live: LiveId, mensagem: MensagemDestacada): Promise<Resultado<void>> {
    this.chamadas.push({ metodo: 'publicarDestacada', args: [live, mensagem], em: new Date() });
    
    const inscritos = this.ouvintes.get(live) ?? [];
    const entregue: MensagemEntregue = { live, destacada: true, mensagem };
    
    for (const ouvinte of inscritos) {
      ouvinte(entregue);
    }
    
    return { ok: true, valor: undefined };
  }

  inscrever(live: LiveId, ouvinte: (mensagem: MensagemEntregue) => void): Cancelamento {
    this.chamadas.push({ metodo: 'inscrever', args: [live, ouvinte], em: new Date() });
    
    const lista = this.ouvintes.get(live) ?? [];
    lista.push(ouvinte);
    this.ouvintes.set(live, lista);

    let cancelado = false;
    return () => {
      if (cancelado) return;
      cancelado = true;
      const atuais = this.ouvintes.get(live) ?? [];
      this.ouvintes.set(live, atuais.filter(o => o !== ouvinte));
    };
  }
}