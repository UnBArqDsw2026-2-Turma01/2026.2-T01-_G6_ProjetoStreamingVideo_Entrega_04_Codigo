import { EventBusEmMemoria, pacoteId, usuarioId, type EventoDominio, type Sessao } from "@g6/shared-kernel";
import { casosRecargaPort } from "@g6/shared-kernel/testing";
import { RepositorioEmMemoria } from "../../src/comum/compartilhado";
import { Dinheiro, Usuario } from "../../src/comum/dominio";
import { ServicoFinanceiro } from "../../src/comum/financeiro";
import {
  AdaptadorProcessadorSimulado,
  ProcessadorSimulado,
  RecargaService,
  assinarNotificacao,
  type Pacote,
} from "../../src/recarga";

const SEGREDO = "segredo-simulado";

// Ids fixos exigidos pela suíte de contrato do kernel (casosRecargaPort).
const pacotes: Pacote[] = [{ id: "pct_valido", quantidadeMoedaVirtual: 210, valorBase: Dinheiro.deReais(10) }];

function montar() {
  const usuarios = new RepositorioEmMemoria<Usuario>();
  usuarios.salvar(new Usuario("usr_1", "Espectador", "um@exemplo.com"));
  usuarios.salvar(new Usuario("usr_2", "Outro", "dois@exemplo.com"));
  const processador = new ProcessadorSimulado();
  const eventos = new EventBusEmMemoria();
  const publicados: EventoDominio[] = [];
  eventos.assinar("RecargaConcluida", (evento) => publicados.push(evento));
  const servico = new RecargaService({
    gateways: { simulado: new AdaptadorProcessadorSimulado(processador, SEGREDO, "Simulado") },
    financeiro: new ServicoFinanceiro(),
    usuarios,
    eventos,
    pacotes,
  });

  /** Faz o papel do espectador pagando e do processador avisando (assinado). */
  async function pagar(recargaId: string) {
    const consulta = await servico.consultar(sessao("usr_1"), recargaId);
    if (!consulta.ok || consulta.valor.situacao !== "pendente") throw new Error("recarga não pendente");
    const idPagamento = consulta.valor.checkout.instrucoes.replace("pague o protocolo ", "");
    processador.aprovar(idPagamento);
    const dados = { idEvento: `ev-${idPagamento}`, idPagamento, recargaId };
    return servico.receberAviso("simulado", { ...dados, assinatura: assinarNotificacao(SEGREDO, dados) });
  }

  return { servico, usuarios, publicados, pagar };
}

const sessao = (id: string): Sessao => ({ usuarioId: usuarioId(id), papel: "espectador", token: "t", expiraEm: new Date() });

describe("RecargaService · suíte de contrato do RecargaPort", () => {
  let atual: ReturnType<typeof montar>;
  const casos = casosRecargaPort(
    () => {
      atual = montar();
      return atual.servico;
    },
    async (recargaId) => {
      await atual.pagar(recargaId);
    },
  );
  for (const caso of casos) test(caso.nome, caso.executar);
});

describe("RecargaService · tradução da E03 para o contrato", () => {
  test("ofertas trazem os preços do Decorator em centavos", async () => {
    const { servico } = montar();
    const r = await servico.ofertas(sessao("usr_1"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor[0]).toMatchObject({ pacote: "pct_valido", moeda: 210 });
    expect(r.valor[0].precoCentavos).toBeLessThanOrEqual(r.valor[0].precoSemDescontoCentavos);
  });

  test("recarregar não credita; o aviso autêntico credita e publica RecargaConcluida uma vez", async () => {
    const { servico, usuarios, publicados, pagar } = montar();

    const r = await servico.recarregar(sessao("usr_1"), pacoteId("pct_valido"), "simulado");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(usuarios.buscarPorId("usr_1")!.carteira.saldoMoedaVirtual).toBe(0);

    expect((await pagar(r.valor.recargaId)).efeito).toBe("CREDITADO");
    expect(usuarios.buscarPorId("usr_1")!.carteira.saldoMoedaVirtual).toBe(210);
    expect(publicados).toEqual([expect.objectContaining({ tipo: "RecargaConcluida", recargaId: r.valor.recargaId, moeda: 210 })]);
  });

  test("meio não oferecido devolve MEIO_INDISPONIVEL com as alternativas", async () => {
    const { servico } = montar();
    const r = await servico.recarregar(sessao("usr_1"), pacoteId("pct_valido"), "stripe");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatchObject({ codigo: "MEIO_INDISPONIVEL", alternativas: ["simulado"] });
  });

  test("usuário sem carteira é erro, sem exceção", async () => {
    const { servico } = montar();
    const r = await servico.recarregar(sessao("usr_x"), pacoteId("pct_valido"), "simulado");
    expect(r).toMatchObject({ ok: false, erro: { codigo: "USUARIO_INEXISTENTE" } });
  });
});
