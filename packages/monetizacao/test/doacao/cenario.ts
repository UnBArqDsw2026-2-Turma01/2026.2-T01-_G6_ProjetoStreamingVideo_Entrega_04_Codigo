import type {
  Cancelamento,
  ChatPort,
  EventBus,
  EventoDe,
  EventoDominio,
  LiveId,
  TipoEvento,
  TransmissaoPort,
} from "@g6/shared-kernel";
import { canalId, liveId, usuarioId } from "@g6/shared-kernel";
import { FakeChat, FakeTransmissao } from "@g6/shared-kernel/testing";
import { GeradorId, RepositorioEmMemoria } from "../../src/comum/compartilhado";
import { Usuario } from "../../src/comum/dominio";
import { ServicoFinanceiro } from "../../src/comum/financeiro";
import { montarDoacao } from "../../src/doacao";

/** EventBus mínimo para testes: guarda os eventos publicados. */
export class EventBusTeste implements EventBus {
  readonly eventos: EventoDominio[] = [];

  publicar(evento: EventoDominio): void {
    this.eventos.push(evento);
  }

  assinar<T extends TipoEvento>(
    _tipo: T,
    _tratador: (evento: EventoDe<T>) => void,
  ): Cancelamento {
    return () => undefined;
  }
}

/** ChatPort que força falha em `publicarDestacada` (D05), baseado no FakeChat. */
export function chatQueFalhaAoDestacar(base: FakeChat = new FakeChat()): ChatPort {
  return {
    publicar: (live, mensagem) => base.publicar(live, mensagem),
    inscrever: (live, ouvinte) => base.inscrever(live, ouvinte),
    async publicarDestacada() {
      return {
        ok: false,
        erro: { codigo: "CHAT_INDISPONIVEL", mensagem: "Chat indisponível" },
      };
    },
  };
}

export const IDS = {
  doador: usuarioId("usr_1"),
  criador: usuarioId("usr_criador"),
  live: liveId("live_1"),
  canal: canalId("canal_1"),
} as const;

/**
 * Montagem comum aos testes da doação: usuários, live no ar, financeiro, chat e wiring.
 * Alinhado aos ids de `casosDoacaoPort` (`usr_1`, `live_1`).
 */
export function criarCenario(
  opcoes: {
    chat?: ChatPort;
    transmissao?: TransmissaoPort;
    eventBus?: EventBusTeste;
    saldoDoador?: number;
  } = {},
) {
  const doador = new Usuario(IDS.doador, "Espectador", "doador@exemplo.com");
  const criador = new Usuario(IDS.criador, "Criador", "criador@exemplo.com");
  const criadorNaoMonetizado = new Usuario(
    "usuario-iniciante",
    "Iniciante",
    "iniciante@exemplo.com",
  );

  criador.perfil.habilitarMonetizacao();

  if (opcoes.saldoDoador !== undefined && opcoes.saldoDoador > 0) {
    doador.carteira.adicionarMoedaVirtual(opcoes.saldoDoador);
  }

  const usuarios = new RepositorioEmMemoria<Usuario>();
  usuarios.salvar(doador);
  usuarios.salvar(criador);
  usuarios.salvar(criadorNaoMonetizado);

  const transmissao = opcoes.transmissao ?? new FakeTransmissao();
  if (transmissao instanceof FakeTransmissao) {
    transmissao.livesAbertas.set(IDS.live, {
      live: IDS.live,
      canal: IDS.canal,
      criador: IDS.criador,
      titulo: "Live de teste",
      iniciadaEm: new Date(),
    });
  }

  const financeiro = new ServicoFinanceiro();
  const geradorId = new GeradorId();
  const chat = opcoes.chat ?? new FakeChat();
  const eventBus = opcoes.eventBus ?? new EventBusTeste();

  const { controller, servico, mediadorSimples, mediadorComMensagem, repositorioDoacoes } =
    montarDoacao({
      financeiro,
      chat,
      transmissao,
      eventBus,
      usuarios,
      geradorId,
    });

  return {
    doador,
    criador,
    criadorNaoMonetizado,
    usuarios,
    repositorioDoacoes,
    financeiro,
    geradorId,
    chat,
    transmissao,
    eventBus,
    servico,
    controller,
    mediadorSimples,
    mediadorComMensagem,
    live: IDS.live as LiveId,
  };
}
