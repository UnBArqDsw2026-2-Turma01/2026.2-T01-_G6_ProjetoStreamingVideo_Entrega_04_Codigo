// Composition root provisório e casos de uso do CA-01 (live com doação destacada).
//
// Liga os ports do shared-kernel a implementações. A recarga já é a real (`RecargaService`, #10); os
// demais ports ainda usam os fakes do kernel. Conforme a página adotar os pacotes reais (#8 transmissão,
// #9 conteudo, #11 doação, #13 chat, #14 moderação), troca-se a linha correspondente em `compor()`.
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
  type ErroRecarga,
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
import { RecargaService, assinarNotificacao, type GatewaysDoAmbiente } from '@g6/monetizacao';
// Peças internas da monetização que o pacote ainda não exporta (mesmo caminho usado pelo apps/cli-demo):
// o processador simulado e o domínio de carteiras que o `RecargaService` precisa receber.
import { AdaptadorProcessadorSimulado, ProcessadorSimulado } from '../../../packages/monetizacao/src/recarga/pagamento';
import { RepositorioEmMemoria } from '../../../packages/monetizacao/src/comum/compartilhado';
import { Usuario } from '../../../packages/monetizacao/src/comum/dominio';
import { ServicoFinanceiro } from '../../../packages/monetizacao/src/comum/financeiro';

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

/**
 * `RecargaService` (#10) com as contas da sessão: o serviço real só atende quem tem carteira no
 * repositório da monetização, e as contas vêm do login (#17). A carteira é aberta no primeiro uso.
 */
class RecargaComCarteiras implements RecargaPort {
  constructor(
    private readonly servico: RecargaService,
    private readonly usuarios: RepositorioEmMemoria<Usuario>,
  ) {}

  private garantirCarteira(sessao: Sessao): void {
    if (!this.usuarios.buscarPorId(sessao.usuarioId)) {
      this.usuarios.salvar(new Usuario(sessao.usuarioId, sessao.usuarioId, `${sessao.usuarioId}@ca01.local`));
    }
  }

  ofertas(sessao: Sessao): Promise<Resultado<OfertaRecarga[]>> {
    this.garantirCarteira(sessao);
    return this.servico.ofertas(sessao);
  }

  recarregar(sessao: Sessao, pacote: PacoteId, meio: MeioPagamento): Promise<Resultado<CheckoutPendente, ErroRecarga>> {
    this.garantirCarteira(sessao);
    return this.servico.recarregar(sessao, pacote, meio);
  }

  consultar(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>> {
    return this.servico.consultar(sessao, recargaId);
  }
}

/** O que a página precisa dos meios de pagamento além do port: quais existem e como "pagar" no simulado. */
export interface Pagamentos {
  readonly meios: readonly MeioPagamento[];
  /** Paga no processador simulado e entrega o aviso assinado ao Proxy (`receberAviso`), que credita e publica `RecargaConcluida`. */
  confirmarSimulado(checkout: CheckoutPendente): Promise<void>;
}

export class ServicoCA01 {
  private readonly lives = new Map<string, LiveResumo>();
  private readonly saldos = new Map<string, number>();
  private readonly vods: VodResumo[] = [];
  private sequencia = 0;

  constructor(
    readonly portas: Portas,
    readonly bus: EventBus,
    private readonly pagamentos: Pagamentos,
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
  ofertas(sessao: Sessao): Promise<Resultado<OfertaRecarga[]>> {
    return this.portas.recarga.ofertas(sessao);
  }

  recarregar(sessao: Sessao, pacote: PacoteId, meio: MeioPagamento): Promise<Resultado<CheckoutPendente, ErroDominio>> {
    return this.portas.recarga.recarregar(sessao, pacote, meio);
  }

  /** Meios de pagamento oferecidos (o simulado sempre; Mercado Pago e Stripe só com credencial de teste no `.env`). */
  meiosPagamento(): readonly MeioPagamento[] {
    return this.pagamentos.meios;
  }

  /**
   * Confirma uma recarga pendente no meio simulado: o processador aprova e o aviso assinado passa pelo
   * Proxy do `RecargaService`, que credita a carteira e publica `RecargaConcluida`. Nos meios reais a
   * confirmação vem do próprio processador, depois do pagamento no checkout de teste.
   */
  async confirmarRecarga(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>> {
    const antes = await this.portas.recarga.consultar(sessao, recargaId);
    if (!antes.ok || antes.valor.situacao !== 'pendente') return antes;
    if (antes.valor.checkout.meio !== 'simulado') {
      return falha('AGUARDANDO_PROCESSADOR', 'Conclua o pagamento no checkout; o crédito entra quando o processador confirmar');
    }
    await this.pagamentos.confirmarSimulado(antes.valor.checkout);
    return this.portas.recarga.consultar(sessao, recargaId);
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
 * A recarga é a real (#10); sem `pagamentos`, só o meio simulado (testes e `npm run web` sem `.env`).
 */
export function compor(pagamentos?: GatewaysDoAmbiente): ServicoCA01 {
  const bus = new EventBusEmMemoria();

  let gateways = pagamentos?.gateways;
  let simulador = pagamentos?.simulador;
  let segredoSimulado = pagamentos?.segredos.simulado;
  if (!gateways || !simulador || !segredoSimulado) {
    simulador = new ProcessadorSimulado();
    segredoSimulado = 'segredo-simulado';
    gateways = { simulado: new AdaptadorProcessadorSimulado(simulador, segredoSimulado, 'Simulado') };
  }
  const usuarios = new RepositorioEmMemoria<Usuario>();
  const servicoRecarga = new RecargaService({ gateways, financeiro: new ServicoFinanceiro(), usuarios, eventos: bus });

  let avisos = 0;
  const processador = simulador;
  const segredo = segredoSimulado;
  const pagamentosDaPagina: Pagamentos = {
    meios: Object.keys(gateways) as MeioPagamento[],
    async confirmarSimulado(checkout) {
      const idPagamento = checkout.instrucoes.replace('pague o protocolo ', '');
      processador.aprovar(idPagamento);
      const dados = { idEvento: `web-${++avisos}`, idPagamento, recargaId: checkout.recargaId };
      await servicoRecarga.receberAviso('simulado', { ...dados, assinatura: assinarNotificacao(segredo, dados) });
    },
  };

  const portas: Portas = {
    autenticacao: new FakeAutenticacao(),
    transmissao: new FakeTransmissao(),
    recarga: new RecargaComCarteiras(servicoRecarga, usuarios),
    doacao: new FakeDoacao(),
    chat: new FakeChat(),
    moderacao: new FakeModeracao(),
  };
  return new ServicoCA01(portas, bus, pagamentosDaPagina);
}
