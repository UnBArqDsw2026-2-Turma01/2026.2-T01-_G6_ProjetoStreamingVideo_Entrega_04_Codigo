// Composition root provisório e casos de uso do CA-01 (live com doação destacada).
//
// Liga os ports do shared-kernel a implementações. A recarga já é a real (`@g6/monetizacao`,
// com o simulado e, se houver credenciais de teste no `.env`, Mercado Pago e Stripe); os demais
// ports ainda usam fakes do kit de testes do shared-kernel e são trocados em `compor()`.
// Nada fora deste arquivo conhece as implementações: as rotas só falam com `ServicoCA01`.
import {
  EventBusEmMemoria,
  usuarioId,
  type AutenticacaoPort,
  type CanalId,
  type ChatPort,
  type CheckoutPendente,
  type ComprovanteDoacao,
  type DoacaoPort,
  type ErroDominio,
  type EventBus,
  type LiveId,
  type LiveResumo,
  type MeioPagamento,
  type MensagemChat,
  type MensagemDestacada,
  type ModeracaoPort,
  type MoedaVirtual,
  type OfertaRecarga,
  type Papel,
  type PacoteId,
  type PresetTransmissao,
  type RecargaPort,
  type Resultado,
  type Sessao,
  type SituacaoRecarga,
  type TransmissaoPort,
  type UsuarioId,
} from '@g6/shared-kernel';
import {
  FakeAutenticacao,
  FakeChat,
  FakeDoacao,
  FakeModeracao,
  FakeTransmissao,
} from '@g6/shared-kernel/testing';
import { criarRecargaDoApp, gatewaySimulado, type GatewaysDoAmbiente } from '@g6/monetizacao';

export interface Portas {
  readonly autenticacao: AutenticacaoPort;
  readonly transmissao: TransmissaoPort;
  readonly recarga: RecargaPort;
  readonly doacao: DoacaoPort;
  readonly chat: ChatPort;
  readonly moderacao: ModeracaoPort;
}

export interface VodResumo {
  readonly live: LiveId;
  readonly titulo: string;
  readonly criador: UsuarioId;
  readonly iniciadaEm: Date;
  readonly encerradaEm: Date;
}

const falha = (codigo: string, mensagem: string): Resultado<never> => ({ ok: false, erro: { codigo, mensagem } });

// PROVISÓRIO: espelha as faixas de `FaixaDestaque` (#12). Quando `@g6/monetizacao` exportar
// `montarMensagemDestacada` no index do pacote, apague esta tabela e chame a função real.
const FAIXAS = [
  { minimo: 50000, cor: 'VERMELHO', fixacaoMin: 300, limite: 350 },
  { minimo: 5000, cor: 'ROSA', fixacaoMin: 30, limite: 250 },
  { minimo: 2000, cor: 'LARANJA', fixacaoMin: 10, limite: 225 },
  { minimo: 500, cor: 'VERDE', fixacaoMin: 2, limite: 150 },
  { minimo: 200, cor: 'AZUL', fixacaoMin: 0, limite: 50 },
];

function montarDestaque(valor: MoedaVirtual, texto: string, base: MensagemChat): Resultado<MensagemDestacada> {
  const faixa = FAIXAS.find((f) => valor >= f.minimo);
  if (!faixa) return falha('VALOR_ABAIXO_DO_MINIMO', 'Mensagem destacada exige doação de ao menos 200');
  if (texto.length > faixa.limite) {
    return falha('MENSAGEM_ACIMA_DO_LIMITE', `Esta faixa aceita até ${faixa.limite} caracteres`);
  }
  return { ok: true, valor: { ...base, valor, cor: faixa.cor, tempoFixacaoMin: faixa.fixacaoMin } };
}

/** O que o CA-01 usa da recarga além do port: carteira, meios e verificação do pagamento. */
export interface PagamentoRecarga {
  /** Meios oferecidos nesta execução (o simulado e os reais conectados). */
  meios(): MeioPagamento[];
  /** Cria a carteira do usuário na recarga na primeira vez que ele a usa. */
  garantirCarteira(usuario: UsuarioId): void;
  /** Consulta o processador e, se aprovado, credita (e publica `RecargaConcluida`). */
  verificar(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>>;
}

export class ServicoCA01 {
  private readonly lives = new Map<string, LiveResumo>();
  private readonly saldos = new Map<string, number>();
  private readonly vods: VodResumo[] = [];
  private sequencia = 0;

  constructor(
    readonly portas: Portas,
    readonly bus: EventBus,
    private readonly pagamento: PagamentoRecarga,
  ) {
    // RecargaConcluida é o aviso de que o crédito entrou (o port só devolve o checkout pendente).
    bus.assinar('RecargaConcluida', (e) => this.creditar(e.usuario, e.moeda));
    // PROVISÓRIO até #9: quem cria o VOD é o pacote `conteudo` ao receber LiveEncerrada.
    bus.assinar('LiveEncerrada', (e) => {
      const live = this.lives.get(e.live);
      if (!live) return;
      this.lives.delete(e.live);
      this.vods.push({ live: live.live, titulo: live.titulo, criador: live.criador, iniciadaEm: live.iniciadaEm, encerradaEm: e.em });
    });
  }

  /** Faixas da mensagem destacada, da menor para a maior, para a tela montar o seletor de valor. */
  faixas() {
    return [...FAIXAS].reverse().map((f) => ({ minimo: f.minimo, cor: f.cor, fixacaoMin: f.fixacaoMin, limite: f.limite }));
  }

  // ---- sessão (provisório até o login da #17) ----
  sessaoDemo(papel: Papel): Sessao {
    const nome = papel === 'criador' ? 'usr_criador' : papel === 'moderador' ? 'usr_moderador' : 'usr_espectador';
    return { usuarioId: usuarioId(nome), papel, token: `tok_${nome}_${++this.sequencia}`, expiraEm: new Date(Date.now() + 3_600_000) };
  }

  // ---- transmissão ----
  async abrirLive(sessao: Sessao, preset: PresetTransmissao): Promise<Resultado<LiveResumo>> {
    const r = await this.portas.transmissao.abrir(sessao, preset);
    if (!r.ok) return r;
    this.lives.set(r.valor.live, r.valor);
    this.bus.publicar({ tipo: 'LiveIniciada', live: r.valor.live, canal: r.valor.canal as CanalId, em: new Date() });
    return r;
  }

  async encerrarLive(sessao: Sessao, live: LiveId): Promise<Resultado<void>> {
    const resumo = this.lives.get(live);
    const r = await this.portas.transmissao.encerrar(sessao, live);
    if (!r.ok || !resumo) return r;
    this.bus.publicar({ tipo: 'LiveEncerrada', live, canal: resumo.canal, em: new Date() });
    return r;
  }

  livesAbertas(): LiveResumo[] {
    return [...this.lives.values()];
  }

  vodsDisponiveis(): VodResumo[] {
    return [...this.vods];
  }

  // ---- recarga ----
  meiosPagamento(): MeioPagamento[] {
    return this.pagamento.meios();
  }

  ofertas(sessao: Sessao): Promise<Resultado<OfertaRecarga[]>> {
    this.pagamento.garantirCarteira(sessao.usuarioId);
    return this.portas.recarga.ofertas(sessao);
  }

  recarregar(sessao: Sessao, pacote: PacoteId, meio: MeioPagamento): Promise<Resultado<CheckoutPendente, ErroDominio>> {
    this.pagamento.garantirCarteira(sessao.usuarioId);
    return this.portas.recarga.recarregar(sessao, pacote, meio);
  }

  /**
   * Verifica o pagamento da recarga. No simulado, "paga" e credita na hora; no Mercado Pago e
   * no Stripe, consulta o processador e só credita quando ele aprovar. Quem publica
   * `RecargaConcluida` é a recarga, depois que o aviso passa pelo Proxy.
   */
  confirmarRecarga(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>> {
    return this.pagamento.verificar(sessao, recargaId);
  }

  saldo(usuario: UsuarioId): number {
    return this.saldos.get(usuario) ?? 0;
  }

  private creditar(usuario: UsuarioId, moeda: MoedaVirtual): void {
    this.saldos.set(usuario, this.saldo(usuario) + moeda);
  }

  // ---- doação com mensagem destacada ----
  async doar(sessao: Sessao, live: LiveId, valor: MoedaVirtual, texto?: string): Promise<Resultado<ComprovanteDoacao>> {
    if (!Number.isInteger(valor) || valor <= 0) return falha('VALOR_INVALIDO', 'Informe uma quantidade inteira positiva');
    const aberta = await this.portas.transmissao.consultar(live);
    if (!aberta.ok) return falha('LIVE_ENCERRADA', 'Só é possível doar em uma live no ar');
    if (this.saldo(sessao.usuarioId) < valor) return falha('SALDO_INSUFICIENTE', 'Saldo insuficiente: faça uma recarga');

    let destacada: MensagemDestacada | undefined;
    const limpo = texto?.trim();
    if (limpo) {
      const base: MensagemChat = { id: `msg_${++this.sequencia}`, autor: sessao.usuarioId, nomeAutor: this.nomeDe(sessao), texto: limpo, em: new Date() };
      const montada = montarDestaque(valor, limpo, base);
      if (!montada.ok) return montada;
      const veredito = await this.portas.moderacao.avaliar(base);
      if (veredito.decisao !== 'aprovada') return falha('MENSAGEM_REPROVADA', `Mensagem não aprovada pela moderação: ${veredito.motivo}`);
      destacada = montada.valor;
    }

    this.saldos.set(sessao.usuarioId, this.saldo(sessao.usuarioId) - valor);
    const r = await this.portas.doacao.doar(sessao, live, valor, limpo);
    if (!r.ok) {
      this.creditar(sessao.usuarioId, valor);
      return r;
    }
    this.bus.publicar({ tipo: 'DoacaoConfirmada', live, doador: sessao.usuarioId, valor, em: new Date() });
    if (destacada) {
      await this.portas.chat.publicarDestacada(live, destacada);
      this.bus.publicar({ tipo: 'MensagemPublicada', live, autor: sessao.usuarioId, destacada: true, em: new Date() });
    }
    return r;
  }

  // ---- chat ----
  async enviarMensagem(sessao: Sessao, live: LiveId, texto: string): Promise<Resultado<void>> {
    const limpo = texto.trim();
    if (!limpo) return falha('MENSAGEM_VAZIA', 'Escreva uma mensagem');
    const aberta = await this.portas.transmissao.consultar(live);
    if (!aberta.ok) return falha('LIVE_ENCERRADA', 'O chat só funciona com a live no ar');
    const mensagem: MensagemChat = { id: `msg_${++this.sequencia}`, autor: sessao.usuarioId, nomeAutor: this.nomeDe(sessao), texto: limpo, em: new Date() };
    const veredito = await this.portas.moderacao.avaliar(mensagem);
    if (veredito.decisao !== 'aprovada') return falha('MENSAGEM_REPROVADA', `Mensagem não aprovada pela moderação: ${veredito.motivo}`);
    const r = await this.portas.chat.publicar(live, mensagem);
    if (r.ok) this.bus.publicar({ tipo: 'MensagemPublicada', live, autor: sessao.usuarioId, destacada: false, em: new Date() });
    return r;
  }

  private nomeDe(sessao: Sessao): string {
    return sessao.papel === 'criador' ? 'Criador' : sessao.papel === 'moderador' ? 'Moderador' : 'Espectador';
  }
}

/**
 * Composition root: instancia o EventBus e as implementações e injeta os ports.
 * `pagamentos` vem de `gatewaysDoAmbiente(process.env)` no servidor; sem ele (testes), só o simulado.
 */
export function compor(pagamentos: GatewaysDoAmbiente = gatewaySimulado()): ServicoCA01 {
  const bus = new EventBusEmMemoria();
  const recarga = criarRecargaDoApp(pagamentos, bus);
  const portas: Portas = {
    autenticacao: new FakeAutenticacao(),
    transmissao: new FakeTransmissao(),
    recarga: recarga.servico,
    doacao: new FakeDoacao(),
    chat: new FakeChat(),
    moderacao: new FakeModeracao(),
  };
  return new ServicoCA01(portas, bus, {
    meios: () => recarga.servico.meios(),
    garantirCarteira: (usuario) => recarga.garantirUsuario(usuario),
    verificar: (sessao, recargaId) => recarga.servico.verificarPagamento(sessao, recargaId),
  });
}
