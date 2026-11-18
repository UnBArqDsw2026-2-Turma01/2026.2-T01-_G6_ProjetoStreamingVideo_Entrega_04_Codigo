import type { ChatPort, EventBus, TransmissaoPort } from "@g6/shared-kernel";
import { GeradorId, RepositorioEmMemoria } from "../comum/compartilhado";
import type { Usuario } from "../comum/dominio";
import type { ServicoFinanceiro } from "../comum/financeiro";
import { Doacao } from "./Doacao";
import { DoacaoController } from "./DoacaoController";
import { MediatorDoacao } from "./MediatorDoacao";
import { MediatorDoacaoComMensagem } from "./MediatorDoacaoComMensagem";
import { ServicoDoacao } from "./ServicoDoacao";

/**
 * Composição da F2: liga facade, mediators, financeiro, chat, transmissão e event bus.
 * Usado pelos testes e pelo wiring da aplicação.
 */
export function montarDoacao(dependencias: {
  financeiro: ServicoFinanceiro;
  chat: ChatPort;
  transmissao: TransmissaoPort;
  eventBus: EventBus;
  usuarios: RepositorioEmMemoria<Usuario>;
  geradorId?: GeradorId;
  repositorioDoacoes?: RepositorioEmMemoria<Doacao>;
}) {
  const geradorId = dependencias.geradorId ?? new GeradorId();
  const repositorioDoacoes =
    dependencias.repositorioDoacoes ?? new RepositorioEmMemoria<Doacao>();

  const mediadorSimples = new MediatorDoacao(
    dependencias.financeiro,
    repositorioDoacoes,
    geradorId,
  );
  const mediadorComMensagem = new MediatorDoacaoComMensagem(
    dependencias.financeiro,
    dependencias.chat,
    repositorioDoacoes,
    geradorId,
  );

  const servico = new ServicoDoacao(
    mediadorSimples,
    mediadorComMensagem,
    dependencias.financeiro,
    dependencias.chat,
    dependencias.transmissao,
    dependencias.eventBus,
    dependencias.usuarios,
  );
  const controller = new DoacaoController(servico, dependencias.usuarios);

  return {
    controller,
    servico,
    mediadorSimples,
    mediadorComMensagem,
    repositorioDoacoes,
  };
}
