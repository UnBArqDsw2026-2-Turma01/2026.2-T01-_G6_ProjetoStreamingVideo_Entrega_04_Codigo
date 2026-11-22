import type {
  ChatPort,
  ComprovanteDoacao,
  DoacaoPort,
  EventBus,
  LiveId,
  MoedaVirtual,
  Resultado,
  Sessao,
  TransmissaoPort,
} from "@g6/shared-kernel";
import { usuarioId } from "@g6/shared-kernel";
import type { RepositorioEmMemoria } from "../comum/compartilhado";
import { ErroDominio, type Usuario } from "../comum/dominio";
import type { ServicoFinanceiro } from "../comum/financeiro";
import { ErroDestaque, FaixaDestaque, type PropriedadesFaixa } from "../destaque";
import { MediatorDoacao } from "./MediatorDoacao";
import { MediatorDoacaoComMensagem } from "./MediatorDoacaoComMensagem";

/** Opções e faixas de destaque disponíveis para exibição no modal de doação. */
export interface OpcoesDoacao {
  readonly canalId: string;
  readonly habilitadoAReceber: boolean;
  readonly saldoMoedaVirtualDoador: number;
  readonly faixasDisponiveis: readonly PropriedadesFaixa[];
}

/**
 * Fachada da operação de doação e repasse (Padrão GoF: Facade).
 * Implementa `DoacaoPort`: resolve o criador via `TransmissaoPort`, orquestra os
 * mediators e publica `DoacaoConfirmada` no `EventBus`.
 */
export class ServicoDoacao implements DoacaoPort {
  constructor(
    private readonly mediadorSimples: MediatorDoacao,
    private readonly mediadorComMensagem: MediatorDoacaoComMensagem,
    private readonly servicoFinanceiro: ServicoFinanceiro,
    private readonly chat: ChatPort,
    private readonly transmissao: TransmissaoPort,
    private readonly eventBus: EventBus,
    private readonly usuarios: RepositorioEmMemoria<Usuario>,
  ) {}

  /** Exposição do colleague financeiro (wiring / inspeção). */
  get financeiro(): ServicoFinanceiro {
    return this.servicoFinanceiro;
  }

  /** Exposição do colleague de chat (wiring / inspeção). */
  get chatPort(): ChatPort {
    return this.chat;
  }

  /** Consulta prévia para o modal de doação: elegibilidade do canal e faixas disponíveis. */
  consultarOpcoesDoacao(canal: Usuario, doador: Usuario): OpcoesDoacao {
    return {
      canalId: canal.id,
      habilitadoAReceber: canal.perfil.estaHabilitadoAReceber(),
      saldoMoedaVirtualDoador: doador.carteira.saldoMoedaVirtual,
      faixasDisponiveis: [
        FaixaDestaque.FAIXA_1,
        FaixaDestaque.FAIXA_2,
        FaixaDestaque.FAIXA_3,
        FaixaDestaque.FAIXA_4,
        FaixaDestaque.FAIXA_5,
      ],
    };
  }

  /**
   * Doação a uma live (`DoacaoPort`).
   * Com `mensagem` e valor na faixa de destaque, monta a mensagem e entrega via `ChatPort`.
   * Valor abaixo do mínimo de destaque com mensagem: doação simples sem destaque.
   */
  async doar(
    sessao: Sessao,
    live: LiveId,
    valor: MoedaVirtual,
    mensagem?: string,
  ): Promise<Resultado<ComprovanteDoacao>> {
    if (!Number.isInteger(valor) || valor <= 0) {
      return {
        ok: false,
        erro: { codigo: "VALOR_INVALIDO", mensagem: "O valor da doação deve ser um inteiro positivo." },
      };
    }

    const consulta = await this.transmissao.consultar(live);
    if (!consulta.ok) {
      return { ok: false, erro: consulta.erro };
    }

    const doador = this.usuarios.buscarPorId(sessao.usuarioId);
    if (!doador) {
      return {
        ok: false,
        erro: { codigo: "DOADOR_NAO_ENCONTRADO", mensagem: `Doador não encontrado: ${sessao.usuarioId}` },
      };
    }

    const criador = this.usuarios.buscarPorId(consulta.valor.criador);
    if (!criador) {
      return {
        ok: false,
        erro: {
          codigo: "CRIADOR_NAO_ENCONTRADO",
          mensagem: `Criador da live não encontrado: ${consulta.valor.criador}`,
        },
      };
    }

    try {
      const comMensagemDestacavel =
        mensagem !== undefined && valor >= FaixaDestaque.QUANTIDADE_MINIMA_GLOBAL;

      if (mensagem !== undefined && mensagem.trim().length === 0) {
        return {
          ok: false,
          erro: { codigo: "MENSAGEM_VAZIA", mensagem: "A mensagem da doação não pode estar vazia." },
        };
      }

      if (comMensagemDestacavel) {
        const resultado = await this.mediadorComMensagem.processar(
          doador,
          criador,
          valor,
          mensagem!,
          live,
        );
        const em = new Date();
        this.publicarConfirmacao(live, doador, valor, em);
        return {
          ok: true,
          valor: {
            doacaoId: resultado.doacao.id,
            live,
            doador: usuarioId(doador.id),
            valor,
            destaqueEntregue: resultado.destaqueEntregue,
            aviso: resultado.aviso,
            em,
          },
        };
      }

      const { doacao } = this.mediadorSimples.processar(doador, criador, valor);
      const em = new Date();
      this.publicarConfirmacao(live, doador, valor, em);

      const abaixoDoMinimoComMensagem =
        mensagem !== undefined && valor < FaixaDestaque.QUANTIDADE_MINIMA_GLOBAL;

      return {
        ok: true,
        valor: {
          doacaoId: doacao.id,
          live,
          doador: usuarioId(doador.id),
          valor,
          destaqueEntregue: false,
          aviso: abaixoDoMinimoComMensagem
            ? `Doação concluída sem destaque: valor abaixo do mínimo de ${FaixaDestaque.QUANTIDADE_MINIMA_GLOBAL} de moeda virtual.`
            : undefined,
          em,
        },
      };
    } catch (erro) {
      return this.mapearFalha(erro);
    }
  }

  private publicarConfirmacao(
    live: LiveId,
    doador: Usuario,
    valor: MoedaVirtual,
    em: Date,
  ): void {
    this.eventBus.publicar({
      tipo: "DoacaoConfirmada",
      live,
      doador: usuarioId(doador.id),
      valor,
      em,
    });
  }

  private mapearFalha(erro: unknown): Resultado<ComprovanteDoacao> {
    if (erro instanceof ErroDestaque) {
      return { ok: false, erro: { codigo: erro.codigo, mensagem: erro.mensagem } };
    }
    if (erro instanceof ErroDominio) {
      const mensagem = erro.message;
      let codigo = "DOACAO_RECUSADA";
      if (mensagem.includes("Saldo de moeda virtual insuficiente")) {
        codigo = "SALDO_INSUFICIENTE";
      } else if (mensagem.includes("próprio canal")) {
        codigo = "AUTO_DOACAO";
      } else if (mensagem.includes("não está habilitado")) {
        codigo = "CRIADOR_NAO_MONETIZADO";
      } else if (mensagem.includes("excede o limite")) {
        codigo = "MENSAGEM_ACIMA_DO_LIMITE";
      } else if (mensagem.includes("inteiro positivo")) {
        codigo = "VALOR_INVALIDO";
      }
      return { ok: false, erro: { codigo, mensagem } };
    }
    throw erro;
  }
}
