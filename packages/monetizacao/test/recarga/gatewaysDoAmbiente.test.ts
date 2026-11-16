import { gatewaysDoAmbiente } from "../../src/recarga";

// Nenhum destes testes acessa a rede: o SDK só é instanciado, e a verificação
// da conta do Mercado Pago é substituída por um dublê.
const nuncaChamar = async () => {
  throw new Error("não deveria consultar a conta");
};

describe("gatewaysDoAmbiente", () => {
  test("sem .env, só o simulado", async () => {
    const r = await gatewaysDoAmbiente({}, nuncaChamar);
    expect(Object.keys(r.gateways)).toEqual(["simulado"]);
    expect(r.avisos).toEqual([
      expect.stringContaining("Mercado Pago: não usado"),
      expect.stringContaining("Stripe: não usado"),
    ]);
  });

  test("Stripe entra com chave de teste", async () => {
    const r = await gatewaysDoAmbiente({ STRIPE_SECRET_KEY: "sk_test_abc" }, nuncaChamar);
    expect(Object.keys(r.gateways).sort()).toEqual(["simulado", "stripe"]);
  });

  test("Stripe sempre recusa chave LIVE (guia, regra 8)", async () => {
    const r = await gatewaysDoAmbiente({ STRIPE_SECRET_KEY: "sk_live_abc" }, nuncaChamar);
    expect(r.gateways.stripe).toBeUndefined();
    expect(r.avisos).toContainEqual(expect.stringContaining("Stripe: recusado"));
  });

  test("Mercado Pago: TEST- entra sem consultar a conta", async () => {
    const r = await gatewaysDoAmbiente({ MERCADO_PAGO_ACCESS_TOKEN: "TEST-123" }, nuncaChamar);
    expect(r.gateways.mercadopago).toBeDefined();
  });

  test("Mercado Pago: APP_USR- só entra se a conta for de teste", async () => {
    const deTeste = await gatewaysDoAmbiente({ MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-1" }, async () => true);
    expect(deTeste.gateways.mercadopago).toBeDefined();

    const real = await gatewaysDoAmbiente({ MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-1" }, async () => false);
    expect(real.gateways.mercadopago).toBeUndefined();
    expect(real.avisos).toContainEqual(expect.stringContaining("Mercado Pago: recusado"));
  });

  test("falha ao consultar a conta não derruba a recarga: segue só com o simulado", async () => {
    const r = await gatewaysDoAmbiente({ MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-1" }, async () => {
      throw new Error("sem internet");
    });
    expect(Object.keys(r.gateways)).toEqual(["simulado"]);
    expect(r.avisos).toContainEqual(expect.stringContaining("sem internet"));
  });
});
