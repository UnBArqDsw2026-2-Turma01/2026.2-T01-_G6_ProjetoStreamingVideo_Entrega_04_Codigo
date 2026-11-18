import type { TransmissaoPort } from '../../ports';
import type { LiveId, LiveResumo, PresetTransmissao, Resultado, Sessao } from '../../tipos';
import { liveId } from '../../tipos';

export interface ChamadaTransmissao {
  metodo: 'abrir' | 'encerrar' | 'consultar';
  args: [Sessao, PresetTransmissao] | [Sessao, LiveId] | [LiveId];
  em: Date;
}

export class FakeTransmissao implements TransmissaoPort {
  readonly chamadas: ChamadaTransmissao[] = [];
  readonly livesAbertas = new Map<string, LiveResumo>();

  async abrir(criador: Sessao, preset: PresetTransmissao): Promise<Resultado<LiveResumo>> {
    this.chamadas.push({ metodo: 'abrir', args: [criador, preset], em: new Date() });
    
    if (criador.papel !== 'criador') {
      return { ok: false, erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Somente criadores podem abrir lives' } };
    }

    const id = liveId(`live_${Math.random().toString(36).substring(7)}`);
    const resumo: LiveResumo = {
      live: id,
      canal: criador.usuarioId as unknown as any, // Simulação para canalId, que normalmente seria resolvido externamente
      criador: criador.usuarioId,
      titulo: preset.titulo,
      iniciadaEm: new Date()
    };
    
    this.livesAbertas.set(id, resumo);
    return { ok: true, valor: resumo };
  }

  async encerrar(criador: Sessao, live: LiveId): Promise<Resultado<void>> {
    this.chamadas.push({ metodo: 'encerrar', args: [criador, live], em: new Date() });
    
    const resumo = this.livesAbertas.get(live);
    if (!resumo) {
      return { ok: false, erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Live não encontrada' } };
    }
    
    if (resumo.criador !== criador.usuarioId) {
       return { ok: false, erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas o dono pode encerrar a live' } };
    }

    this.livesAbertas.delete(live);
    return { ok: true, valor: undefined };
  }

  async consultar(live: LiveId): Promise<Resultado<LiveResumo>> {
    this.chamadas.push({ metodo: 'consultar', args: [live], em: new Date() });
    
    const resumo = this.livesAbertas.get(live);
    if (resumo) {
      return { ok: true, valor: resumo };
    }
    return { ok: false, erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Live inexistente ou encerrada' } };
  }
}