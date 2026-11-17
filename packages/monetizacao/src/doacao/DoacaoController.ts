import type { ComprovanteDoacao, LiveId, MoedaVirtual, Resultado, Sessao } from "@g6/shared-kernel";
import type { RepositorioEmMemoria } from "../comum/compartilhado";
import { ErroDominio, type Usuario } from "../comum/dominio";
import type { OpcoesDoacao, ServicoDoacao } from "./ServicoDoacao";

/**
 * Porta de entrada do fluxo de doação (Entrega 2: DoacaoController).
 * Cliente da Facade: comunica-se exclusivamente com o ServicoDoacao.
 */
export class DoacaoController {
  constructor(
    private readonly servicoDoacao: ServicoDoacao,
    private readonly repositorioUsuarios: RepositorioEmMemoria<Usuario>,
  ) {}

  /** Consulta opções e faixas disponíveis para o canal antes do envio. */
  consultarOpcoesDoacao(canalId: string, doadorId: string): OpcoesDoacao {
    const canal = this.obterUsuarioOuFalhar(canalId, "Criador");
    const doador = this.obterUsuarioOuFalhar(doadorId, "Espectador");

    return this.servicoDoacao.consultarOpcoesDoacao(canal, doador);
  }

  /** Encaminha ao `DoacaoPort` da facade. */
  doar(
    sessao: Sessao,
    live: LiveId,
    valor: MoedaVirtual,
    mensagem?: string,
  ): Promise<Resultado<ComprovanteDoacao>> {
    return this.servicoDoacao.doar(sessao, live, valor, mensagem);
  }

  private obterUsuarioOuFalhar(id: string, papel: string): Usuario {
    const usuario = this.repositorioUsuarios.buscarPorId(id);
    if (!usuario) {
      throw new ErroDominio(`${papel} não encontrado: ${id}`);
    }
    return usuario;
  }
}
