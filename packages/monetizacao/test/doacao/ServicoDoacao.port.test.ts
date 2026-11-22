import { usuarioId } from "@g6/shared-kernel";
import { FakeChat, casosDoacaoPort } from "@g6/shared-kernel/testing";
import { criarCenario } from "./cenario";

function criarServicoDoacao() {
  const { servico } = criarCenario({ saldoDoador: 500 });
  return servico;
}

const casos = casosDoacaoPort(() => criarServicoDoacao());

describe("Contrato DoacaoPort (ServicoDoacao)", () => {
  for (const caso of casos) {
    test(caso.nome, caso.executar);
  }
});

describe("ServicoDoacao — cenários portados", () => {
  test("falha doação com valor zero sem debitar", async () => {
    const { servico, doador, live } = criarCenario({ saldoDoador: 100 });
    const saldoAntes = doador.carteira.saldoMoedaVirtual;

    const resultado = await servico.doar(
      { usuarioId: usuarioId(doador.id), papel: "espectador", token: "t", expiraEm: new Date() },
      live,
      0,
    );

    expect(resultado.ok).toBe(false);
    expect(doador.carteira.saldoMoedaVirtual).toBe(saldoAntes);
  });

  test("sucesso simples sem mensagem", async () => {
    const { servico, doador, criador, live, eventBus } = criarCenario({ saldoDoador: 100 });

    const resultado = await servico.doar(
      { usuarioId: usuarioId(doador.id), papel: "espectador", token: "t", expiraEm: new Date() },
      live,
      50,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.valor).toBe(50);
      expect(resultado.valor.destaqueEntregue).toBe(false);
    }
    expect(doador.carteira.saldoMoedaVirtual).toBe(50);
    expect(criador.carteira.saldoDinheiro.centavos).toBe(100);
    expect(eventBus.eventos.some((e) => e.tipo === "DoacaoConfirmada")).toBe(true);
  });

  test("sucesso com mensagem destacada", async () => {
    const chat = new FakeChat();
    const { servico, doador, criador, live, eventBus } = criarCenario({
      chat,
      saldoDoador: 500,
    });

    const resultado = await servico.doar(
      { usuarioId: usuarioId(doador.id), papel: "espectador", token: "t", expiraEm: new Date() },
      live,
      200,
      "Apoio à live!",
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.destaqueEntregue).toBe(true);
      expect(resultado.valor.aviso).toBeUndefined();
    }
    expect(doador.carteira.saldoMoedaVirtual).toBe(300);
    expect(criador.carteira.saldoDinheiro.centavos).toBe(400);
    expect(eventBus.eventos.some((e) => e.tipo === "DoacaoConfirmada")).toBe(true);
    expect(chat.chamadas.some((c) => c.metodo === "publicarDestacada")).toBe(true);
  });
});
