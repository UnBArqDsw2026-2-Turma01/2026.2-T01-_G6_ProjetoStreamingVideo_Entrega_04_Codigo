import type { ChatPort, LiveId } from "@g6/shared-kernel";
import { usuarioId } from "@g6/shared-kernel";
import type { GeradorId, RepositorioEmMemoria } from "../comum/compartilhado";
import { ErroDominio, type Usuario } from "../comum/dominio";
import type { ServicoFinanceiro } from "../comum/financeiro";
import { montarMensagemDestacada } from "../destaque";
import { Doacao } from "./Doacao";
import { DoacaoComMensagem } from "./DoacaoComMensagem";

/** Resultado da doação com mensagem e estado da entrega ao chat. */
export interface ResultadoDoacaoComMensagem {
  readonly doacao: DoacaoComMensagem;
  readonly destaqueEntregue: boolean;
  readonly aviso?: string;
}

/**
 * Mediator da doação com mensagem destacada (Padrão GoF: Mediator).
 * Orquestra Financeiro e ChatPort; falha no chat não invalida a doação (D05).
 */
export class MediatorDoacaoComMensagem {
  constructor(
    private readonly servicoFinanceiro: ServicoFinanceiro,
    private readonly chat: ChatPort,
    private readonly repositorioDoacoes: RepositorioEmMemoria<Doacao>,
    private readonly geradorId: GeradorId,
  ) {}

  async processar(
    doador: Usuario,
    criador: Usuario,
    quantidadeMoedaVirtual: number,
    mensagem: string,
    live: LiveId,
  ): Promise<ResultadoDoacaoComMensagem> {
    this.validarPartes(doador, criador);

    // Montagem / validação da mensagem antes do débito (E03: DoacaoComMensagem).
    const doacao = new DoacaoComMensagem(
      this.geradorId.proximo("doacao"),
      doador,
      criador,
      quantidadeMoedaVirtual,
      mensagem,
    );

    const destacada = montarMensagemDestacada(quantidadeMoedaVirtual, mensagem, {
      id: doacao.id,
      autor: usuarioId(doador.id),
      nomeAutor: doador.nome,
      em: new Date(),
    });

    this.transferirOuFalhar(doador, criador, doacao);

    doacao.concluir();
    doador.carteira.registrarTransacao(doacao);
    criador.carteira.registrarTransacao(doacao);
    this.repositorioDoacoes.salvar(doacao);

    const publica = await this.chat.publicarDestacada(live, destacada);
    if (publica.ok) {
      return { doacao, destaqueEntregue: true };
    }

    return {
      doacao,
      destaqueEntregue: false,
      aviso: `Doação e repasse concluídos, mas o chat falhou ao exibir o destaque: ${publica.erro.mensagem}`,
    };
  }

  private validarPartes(doador: Usuario, criador: Usuario): void {
    if (!criador.perfil.estaHabilitadoAReceber()) {
      throw new ErroDominio(`O criador "${criador.nome}" não está habilitado a receber doações.`);
    }
    if (doador.id === criador.id) {
      throw new ErroDominio("Um usuário não pode doar para o próprio canal.");
    }
  }

  private transferirOuFalhar(doador: Usuario, criador: Usuario, doacao: DoacaoComMensagem): void {
    let transferido: boolean;
    try {
      transferido = this.servicoFinanceiro.transferirDoacao(
        doador,
        criador,
        doacao.quantidadeMoedaVirtual,
        doacao.valorRepasse,
      );
    } catch (erro) {
      doacao.cancelar();
      this.repositorioDoacoes.salvar(doacao);
      throw erro;
    }

    if (!transferido) {
      doacao.cancelar();
      this.repositorioDoacoes.salvar(doacao);
      throw new ErroDominio(
        `Saldo de moeda virtual insuficiente na carteira de "${doador.nome}" para doar ${doacao.quantidadeMoedaVirtual}.`,
      );
    }
  }
}
