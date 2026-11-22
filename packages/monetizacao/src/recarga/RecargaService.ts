import {
  pacoteId,
  usuarioId,
  type CheckoutPendente,
  type ErroRecarga,
  type EventBus,
  type MeioPagamento,
  type OfertaRecarga,
  type PacoteId,
  type RecargaPort,
  type Recibo,
  type Resultado,
  type Sessao,
  type SituacaoRecarga,
} from "@g6/shared-kernel";
import type { RepositorioEmMemoria } from "../comum/compartilhado";
import { StatusTransacao, type Usuario } from "../comum/dominio";
import type { ServicoFinanceiro } from "../comum/financeiro";
import { EfeitoConfirmacao, type ResultadoConfirmacao } from "./confirmacao";
import { montarRecarga } from "./montarRecarga";
import type { Pacote } from "./Pacote";
import { ErroMeioPagamentoIndisponivel, type GatewayPagamento, type NotificacaoPagamento } from "./pagamento";
import { MetodoRecarga, type Recarga } from "./Recarga";
import type { RecargaController } from "./RecargaController";
import type { ConfiguracaoPreco } from "./ServicoRecarga";

/** O que a composição (apps/*) entrega à recarga. */
export interface DependenciasRecargaService {
  /** Um gateway por meio oferecido. Sem credenciais, só `simulado`. */
  readonly gateways: Partial<Record<MeioPagamento, GatewayPagamento>>;
  readonly financeiro: ServicoFinanceiro;
  readonly usuarios: RepositorioEmMemoria<Usuario>;
  /** Onde publicar `RecargaConcluida`. Opcional para testes isolados. */
  readonly eventos?: EventBus;
  readonly pacotes?: readonly Pacote[];
  readonly configuracaoPreco?: ConfiguracaoPreco;
}

/**
* Implementação de `RecargaPort` (#10): adapta a recarga da E03 ao contrato do kernel.
*
* Não contém regra de negócio. Delega ao `RecargaController` da E03, que é o Client
* do Decorator e do Adapter (via `ServicoRecarga`) e do Proxy (via `receberWebhook`),
* e traduz entidades e exceções da E03 em DTOs e `Resultado` do kernel.
*
* O aviso de pagamento (webhook) fica fora do port, como diz o TSDoc de `RecargaPort`:
* `apps/web` liga a rota a `receberAviso`, que é também quem publica `RecargaConcluida`.
*/
export class RecargaService implements RecargaPort {
  private readonly controller: RecargaController;
  private readonly recargas: RepositorioEmMemoria<Recarga>;
  private readonly usuarios: RepositorioEmMemoria<Usuario>;
  private readonly eventos?: EventBus;
  /** Nome do gateway (E03) → meio do contrato. */
  private readonly meioDoGateway = new Map<string, MeioPagamento>();
  /** Meio do contrato → nome do gateway (E03). */
  private readonly gatewayDoMeio = new Map<MeioPagamento, string>();
  /** Instante em que cada recarga foi creditada, para o `Recibo`. */
  private readonly concluidaEm = new Map<string, Date>();

  constructor(dependencias: DependenciasRecargaService) {
    const gateways: GatewayPagamento[] = [];
    for (const [meio, gateway] of Object.entries(dependencias.gateways) as [MeioPagamento, GatewayPagamento][]) {
      gateways.push(gateway);
      this.meioDoGateway.set(gateway.nome, meio);
      this.gatewayDoMeio.set(meio, gateway.nome);
    }

    const { controller, recargas } = montarRecarga({
      gateways,
      financeiro: dependencias.financeiro,
      usuarios: dependencias.usuarios,
      pacotes: dependencias.pacotes,
      configuracaoPreco: dependencias.configuracaoPreco,
    });
    this.controller = controller;
    this.recargas = recargas;
    this.usuarios = dependencias.usuarios;
    this.eventos = dependencias.eventos;
  }

  async ofertas(sessao: Sessao): Promise<Resultado<OfertaRecarga[]>> {
    if (!this.usuarios.buscarPorId(sessao.usuarioId)) return this.usuarioInexistente(sessao);

    const ofertas = this.controller.consultarOfertas(sessao.usuarioId).map(
      (oferta): OfertaRecarga => ({
        pacote: pacoteId(oferta.pacote.id),
        moeda: oferta.pacote.quantidadeMoedaVirtual,
        precoSemDescontoCentavos: oferta.precoSemDesconto.centavos,
        precoCentavos: oferta.precoPromocional.centavos,
        descontoPercentual: oferta.descontoPercentual,
        composicao: oferta.composicao,
      }),
    );
    return { ok: true, valor: ofertas };
  }

  async recarregar(
    sessao: Sessao,
    pacote: PacoteId,
    meio: MeioPagamento,
  ): Promise<Resultado<CheckoutPendente, ErroRecarga>> {
    if (!this.usuarios.buscarPorId(sessao.usuarioId)) return this.usuarioInexistente(sessao);

    const gateway = this.gatewayDoMeio.get(meio);
    if (!gateway) {
      return {
        ok: false,
        erro: {
          codigo: "MEIO_INDISPONIVEL",
          mensagem: `Meio de pagamento não oferecido: ${meio}`,
          alternativas: [...this.gatewayDoMeio.keys()],
        },
      };
    }

    try {
      const recarga = await this.controller.recarregar(
        sessao.usuarioId,
        pacote,
        MetodoRecarga.PROCESSADOR_EXTERNO,
        gateway,
      );
      return { ok: true, valor: this.checkout(recarga) };
    } catch (erro) {
      if (erro instanceof ErroMeioPagamentoIndisponivel) {
        return {
          ok: false,
          erro: {
            codigo: "MEIO_INDISPONIVEL",
            mensagem: erro.message,
            alternativas: erro.alternativas
              .map((nome) => this.meioDoGateway.get(nome))
              .filter((m): m is MeioPagamento => m !== undefined),
          },
        };
      }
      // Pacote inexistente (ErroDominio da E03) ou falha do processador ao criar o checkout.
      return { ok: false, erro: { codigo: "RECARGA_RECUSADA", mensagem: (erro as Error).message } };
    }
  }

  async consultar(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>> {
    const recarga = this.recargas.buscarPorId(recargaId);
    if (!recarga || recarga.usuario.id !== sessao.usuarioId) {
      return { ok: false, erro: { codigo: "RECARGA_INEXISTENTE", mensagem: `Recarga não encontrada: ${recargaId}` } };
    }

    switch (recarga.status) {
      case StatusTransacao.PENDENTE:
        return { ok: true, valor: { situacao: "pendente", checkout: this.checkout(recarga) } };
      case StatusTransacao.CONCLUIDA:
        return { ok: true, valor: { situacao: "concluida", recibo: this.recibo(recarga) } };
      default:
        return {
          ok: true,
          valor: { situacao: "cancelada", recargaId: recarga.id, motivo: recarga.motivoCancelamento ?? "cancelada" },
        };
    }
  }

  /**
  * Entrada do aviso de pagamento, fora do port: `apps/web` liga a rota do webhook aqui.
  * O aviso passa pelo Proxy (O11, O14); se creditar, publica `RecargaConcluida` uma vez.
  */
  async receberAviso(meio: MeioPagamento, notificacao: NotificacaoPagamento): Promise<ResultadoConfirmacao> {
    const gateway = this.gatewayDoMeio.get(meio) ?? meio;
    const resultado = await this.controller.receberWebhook(gateway, notificacao);

    if (resultado.efeito === EfeitoConfirmacao.CREDITADO) {
      const recarga = this.recargas.buscarPorId(notificacao.recargaId);
      if (recarga) {
        const em = new Date();
        this.concluidaEm.set(recarga.id, em);
        this.eventos?.publicar({
          tipo: "RecargaConcluida",
          recargaId: recarga.id,
          usuario: usuarioId(recarga.usuario.id),
          moeda: recarga.quantidadeMoedaVirtual,
          em,
        });
      }
    }
    return resultado;
  }

  private checkout(recarga: Recarga): CheckoutPendente {
    return {
      recargaId: recarga.id,
      pacote: pacoteId(recarga.pacoteId),
      meio: this.meioDe(recarga),
      valorCobradoCentavos: recarga.valor.centavos,
      moedaACreditar: recarga.quantidadeMoedaVirtual,
      instrucoes: recarga.instrucoesPagamento ?? "",
    };
  }

  private recibo(recarga: Recarga): Recibo {
    return {
      recargaId: recarga.id,
      pacote: pacoteId(recarga.pacoteId),
      moedaCreditada: recarga.quantidadeMoedaVirtual,
      valorCobradoCentavos: recarga.valor.centavos,
      meio: this.meioDe(recarga),
      em: this.concluidaEm.get(recarga.id) ?? recarga.dataHora,
    };
  }

  private meioDe(recarga: Recarga): MeioPagamento {
    return this.meioDoGateway.get(recarga.gatewayUtilizado ?? "") ?? "simulado";
  }

  private usuarioInexistente(sessao: Sessao): { ok: false; erro: ErroRecarga } {
    return { ok: false, erro: { codigo: "USUARIO_INEXISTENTE", mensagem: `Usuário sem carteira: ${sessao.usuarioId}` } };
  }
}
