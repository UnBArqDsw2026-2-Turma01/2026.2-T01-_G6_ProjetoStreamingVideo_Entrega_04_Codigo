// Composition root e casos de uso do CA-01 (live com doação destacada).
//
// Liga os ports do shared-kernel aos módulos reais, como o apps/cli-demo: identidade (#5), transmissão
// (#8), conteúdo (#9), recarga (#10), doação (#11), mensagem destacada (#12), chat (#13) e moderação (#14).
// As rotas só falam com `ServicoCA01`; nada fora deste arquivo conhece as implementações.
import {
  EventBusEmMemoria,
  usuarioId,
  type AutenticacaoPort,
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
import { criarAutenticacaoExemplo } from '@g6/identidade';
import { TransmissaoService } from '@g6/transmissao';
import { ConteudoDeLive } from '@g6/conteudo';
import { ChatService } from '@g6/chat';
import { ModeracaoService } from '@g6/moderacao';
import { RecargaService, assinarNotificacao, type GatewaysDoAmbiente } from '@g6/monetizacao';
// Peças internas da monetização que o pacote ainda não exporta (mesmo caminho usado pelo apps/cli-demo):
// processador simulado, carteiras, a doação (Facade + Mediator) e as faixas da mensagem destacada.
import { AdaptadorProcessadorSimulado, ProcessadorSimulado } from '../../../packages/monetizacao/src/recarga/pagamento';
import { RepositorioEmMemoria } from '../../../packages/monetizacao/src/comum/compartilhado';
import { Usuario } from '../../../packages/monetizacao/src/comum/dominio';
import { ServicoFinanceiro } from '../../../packages/monetizacao/src/comum/financeiro';
import { montarDoacao } from '../../../packages/monetizacao/src/doacao';
import { FaixaDestaque } from '../../../packages/monetizacao/src/destaque';

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

/** Faixas da mensagem destacada, da maior para a menor, lidas do `FaixaDestaque` real (#12). */
const FAIXAS = [FaixaDestaque.FAIXA_5, FaixaDestaque.FAIXA_4, FaixaDestaque.FAIXA_3, FaixaDestaque.FAIXA_2, FaixaDestaque.FAIXA_1].map((f) => ({
  minimo: f.quantidadeMinima,
  cor: f.cor,
  fixacaoMin: f.tempoFixacaoMin,
  limite: f.limiteCaracteres,
}));

const nomeDoPapel = (papel: Papel): string => (papel === 'criador' ? 'Criador' : papel === 'moderador' ? 'Moderador' : 'Espectador');

/**
 * Carteiras da monetização para as contas da sessão. As contas vêm do login (#17); a carteira é aberta no
 * primeiro uso, e a do criador já sai habilitada a receber doações (como no apps/cli-demo).
 */
export class Carteiras {
  constructor(readonly usuarios: RepositorioEmMemoria<Usuario>) {}

  garantir(sessao: Sessao): Usuario {
    let usuario = this.usuarios.buscarPorId(sessao.usuarioId);
    if (!usuario) {
      usuario = new Usuario(sessao.usuarioId, nomeDoPapel(sessao.papel), `${sessao.usuarioId}@ca01.local`);
      this.usuarios.salvar(usuario);
    }
    if (sessao.papel === 'criador' && !usuario.perfil.estaHabilitadoAReceber()) usuario.perfil.habilitarMonetizacao();
    return usuario;
  }

  /** Moeda virtual disponível para doar. */
  moeda(usuario: UsuarioId): number {
    return this.usuarios.buscarPorId(usuario)?.carteira.saldoMoedaVirtual ?? 0;
  }

  /** O que já recebeu em dinheiro pelas doações (repasse ao criador), em centavos. */
  ganhosCentavos(usuario: UsuarioId): number {
    return this.usuarios.buscarPorId(usuario)?.carteira.saldoDinheiro.centavos ?? 0;
  }
}

/** `RecargaService` (#10) atendendo as contas da sessão: abre a carteira antes de usar o serviço. */
class RecargaComCarteiras implements RecargaPort {
  constructor(
    private readonly servico: RecargaService,
    private readonly carteiras: Carteiras,
  ) {}

  ofertas(sessao: Sessao): Promise<Resultado<OfertaRecarga[]>> {
    this.carteiras.garantir(sessao);
    return this.servico.ofertas(sessao);
  }

  recarregar(sessao: Sessao, pacote: PacoteId, meio: MeioPagamento): Promise<Resultado<CheckoutPendente, ErroRecarga>> {
    this.carteiras.garantir(sessao);
    return this.servico.recarregar(sessao, pacote, meio);
  }

  consultar(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>> {
    return this.servico.consultar(sessao, recargaId);
  }
}

/** O que a página precisa dos meios de pagamento além do port: quais existem e como confirmar. */
export interface Pagamentos {
  readonly meios: readonly MeioPagamento[];
  /** Paga no processador simulado e entrega o aviso assinado ao Proxy (`receberAviso`), que credita e publica `RecargaConcluida`. */
  confirmarSimulado(checkout: CheckoutPendente): Promise<void>;
  /**
   * Meios reais (Stripe): entrega ao Proxy um aviso do checkout; o Proxy consulta o próprio processador
   * e só credita se ele disser que está pago. Faz o papel do webhook, que não alcança um localhost.
   */
  verificarExterno(checkout: CheckoutPendente): Promise<void>;
}

export class ServicoCA01 {
  private readonly lives = new Map<string, LiveResumo>();
  private readonly vods: VodResumo[] = [];
  private sequencia = 0;

  constructor(
    readonly portas: Portas,
    readonly bus: EventBus,
    private readonly pagamentos: Pagamentos,
    private readonly carteiras: Carteiras,
  ) {
    // A gravação em si é criada pelo `conteudo` (#9) ao receber LiveEncerrada; aqui fica a lista da página.
    bus.assinar('LiveEncerrada', (e) => {
      const live = this.lives.get(e.live);
      if (!live) return;
      this.lives.delete(e.live);
      this.vods.push({ live: live.live, titulo: live.titulo, criador: live.criador, iniciadaEm: live.iniciadaEm, encerradaEm: e.em });
    });
  }

  /** Faixas da mensagem destacada, da menor para a maior, para a tela montar o seletor de valor. */
  faixas() {
    return [...FAIXAS].reverse();
  }

  // ---- sessão de demonstração (os testes usam; a página usa o login da #17) ----
  sessaoDemo(papel: Papel): Sessao {
    const nome = papel === 'criador' ? 'usr_criador' : papel === 'moderador' ? 'usr_moderador' : 'usr_espectador';
    return { usuarioId: usuarioId(nome), papel, token: `tok_${nome}_${++this.sequencia}`, expiraEm: new Date(Date.now() + 3_600_000) };
  }

  // ---- transmissão (o canal publica LiveIniciada e LiveEncerrada) ----
  async abrirLive(sessao: Sessao, preset: PresetTransmissao): Promise<Resultado<LiveResumo>> {
    if (sessao.papel === 'criador') this.carteiras.garantir(sessao); // quem abre a live recebe as doações
    const r = await this.portas.transmissao.abrir(sessao, preset);
    if (r.ok) this.lives.set(r.valor.live, r.valor);
    return r;
  }

  encerrarLive(sessao: Sessao, live: LiveId): Promise<Resultado<void>> {
    return this.portas.transmissao.encerrar(sessao, live);
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
   * Confirma uma recarga pendente: no simulado, o processador aprova e o aviso assinado passa pelo Proxy;
   * nos reais, o Proxy consulta o processador. Em ambos, é o `RecargaService` que credita e publica `RecargaConcluida`.
   */
  async confirmarRecarga(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>> {
    const antes = await this.portas.recarga.consultar(sessao, recargaId);
    if (!antes.ok || antes.valor.situacao !== 'pendente') return antes;
    const { checkout } = antes.valor;
    if (checkout.meio === 'simulado') await this.pagamentos.confirmarSimulado(checkout);
    else await this.pagamentos.verificarExterno(checkout);
    const depois = await this.portas.recarga.consultar(sessao, recargaId);
    if (depois.ok && depois.valor.situacao === 'pendente' && checkout.meio !== 'simulado') {
      return falha('PAGAMENTO_PENDENTE', 'O processador ainda não confirmou o pagamento. Conclua o checkout e tente de novo.');
    }
    return depois;
  }

  /** Moeda virtual na carteira real da monetização. */
  saldo(usuario: UsuarioId): number {
    return this.carteiras.moeda(usuario);
  }

  /** Quanto a conta já recebeu pelas doações (repasse ao criador), em centavos. */
  ganhosCentavos(usuario: UsuarioId): number {
    return this.carteiras.ganhosCentavos(usuario);
  }

  // ---- doação ----
  /**
   * Doação pelo `DoacaoPort` real (#11): debita a moeda do espectador, repassa ao criador em dinheiro,
   * monta a mensagem destacada (#12), publica no chat com moderação (#13, #14) e publica `DoacaoConfirmada`.
   */
  async doar(sessao: Sessao, live: LiveId, valor: MoedaVirtual, texto?: string): Promise<Resultado<ComprovanteDoacao>> {
    if (!Number.isInteger(valor) || valor <= 0) return falha('VALOR_INVALIDO', 'Informe uma quantidade inteira positiva');
    this.carteiras.garantir(sessao);
    const r = await this.portas.doacao.doar(sessao, live, valor, texto?.trim() || undefined);
    if (!r.ok && r.erro.codigo === 'NAO_ENCONTRADA') return falha('LIVE_ENCERRADA', 'Só é possível doar em uma live no ar');
    return r;
  }

  // ---- chat (a moderação acontece dentro do `ChatService`) ----
  async enviarMensagem(sessao: Sessao, live: LiveId, texto: string): Promise<Resultado<void>> {
    const limpo = texto.trim();
    if (!limpo) return falha('MENSAGEM_VAZIA', 'Escreva uma mensagem');
    const aberta = await this.portas.transmissao.consultar(live);
    if (!aberta.ok) return falha('LIVE_ENCERRADA', 'O chat só funciona com a live no ar');
    const mensagem: MensagemChat = { id: `msg_${++this.sequencia}`, autor: sessao.usuarioId, nomeAutor: nomeDoPapel(sessao.papel), texto: limpo, em: new Date() };
    return this.portas.chat.publicar(live, mensagem);
  }
}

/**
 * Composition root: instancia o EventBus e os módulos reais e injeta os ports.
 * Sem `pagamentos`, a recarga oferece só o meio simulado (testes e `npm run web` sem `.env`).
 */
export function compor(pagamentos?: GatewaysDoAmbiente): ServicoCA01 {
  const bus = new EventBusEmMemoria();

  // Identidade (#5): o login da página usa a mesma cadeia em src/auth; aqui fica o port para o restante.
  const { autenticacao } = criarAutenticacaoExemplo();

  // Transmissão (#8): Builder da configuração + canal (Observer), que publica LiveIniciada/LiveEncerrada.
  const transmissao = new TransmissaoService({ eventBus: bus });

  // Conteúdo (#9): cria a gravação (Factory Method) ao receber LiveEncerrada.
  new ConteudoDeLive({ eventos: bus, transmissao }).assinar();

  // Moderação (#14) e chat (#13): o chat só entrega o que a moderação aprova e publica MensagemPublicada.
  const moderacao = new ModeracaoService();
  const chat = new ChatService({ moderacao, eventos: bus });

  // Monetização: carteiras compartilhadas pela recarga (#10) e pela doação (#11).
  const usuarios = new RepositorioEmMemoria<Usuario>();
  const carteiras = new Carteiras(usuarios);
  const financeiro = new ServicoFinanceiro();

  let gateways = pagamentos?.gateways;
  let simulador = pagamentos?.simulador;
  let segredoSimulado = pagamentos?.segredos.simulado;
  if (!gateways || !simulador || !segredoSimulado) {
    simulador = new ProcessadorSimulado();
    segredoSimulado = 'segredo-simulado';
    gateways = { simulado: new AdaptadorProcessadorSimulado(simulador, segredoSimulado, 'Simulado') };
  }
  const servicoRecarga = new RecargaService({ gateways, financeiro, usuarios, eventos: bus });
  const { servico: doacao } = montarDoacao({ financeiro, chat, transmissao, eventBus: bus, usuarios });

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
    async verificarExterno(checkout) {
      // O Stripe devolve a URL do Checkout Session, que contém o id da sessão (cs_test_...).
      const idPagamento = /\b(cs_(?:test|live)_[A-Za-z0-9]+)/.exec(checkout.instrucoes)?.[1];
      const segredoMeio = pagamentos?.segredos[checkout.meio];
      if (checkout.meio !== 'stripe' || !idPagamento || !segredoMeio) return;
      const dados = { idEvento: `web-${++avisos}`, idPagamento, recargaId: checkout.recargaId };
      await servicoRecarga.receberAviso(checkout.meio, { ...dados, assinatura: assinarNotificacao(segredoMeio, dados) });
    },
  };

  const portas: Portas = {
    autenticacao,
    transmissao,
    recarga: new RecargaComCarteiras(servicoRecarga, carteiras),
    doacao,
    chat,
    moderacao,
  };
  return new ServicoCA01(portas, bus, pagamentosDaPagina, carteiras);
}
