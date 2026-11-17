import { usuarioId } from "@g6/shared-kernel";
import { chatQueFalhaAoDestacar, criarCenario } from "./cenario";

describe("D05 — falha no chat não desfaz doação", () => {
  test("FakeChat com falha forçada: ok true, destaqueEntregue false, saldos e evento", async () => {
    const chat = chatQueFalhaAoDestacar();
    const { servico, doador, criador, live, eventBus } = criarCenario({
      chat,
      saldoDoador: 1000,
    });

    const saldoMoedaAntes = doador.carteira.saldoMoedaVirtual;
    const saldoDinheiroAntes = criador.carteira.saldoDinheiro.centavos;

    const resultado = await servico.doar(
      {
        usuarioId: usuarioId(doador.id),
        papel: "espectador",
        token: "t",
        expiraEm: new Date(),
      },
      live,
      500,
      "Apoio",
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.destaqueEntregue).toBe(false);
      expect(resultado.valor.aviso).toContain("Chat indisponível");
    }

    expect(doador.carteira.saldoMoedaVirtual).toBe(saldoMoedaAntes - 500);
    expect(criador.carteira.saldoDinheiro.centavos).toBe(saldoDinheiroAntes + 1000);

    const confirmada = eventBus.eventos.find((e) => e.tipo === "DoacaoConfirmada");
    expect(confirmada).toBeDefined();
    if (confirmada && confirmada.tipo === "DoacaoConfirmada") {
      expect(confirmada.live).toBe(live);
      expect(confirmada.doador).toBe(doador.id);
      expect(confirmada.valor).toBe(500);
    }
  });
});
