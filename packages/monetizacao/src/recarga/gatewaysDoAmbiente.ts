import { MercadoPagoConfig, User } from "mercadopago";
import type { MeioPagamento } from "@g6/shared-kernel";
import {
  AdaptadorMercadoPago,
  AdaptadorProcessadorSimulado,
  AdaptadorStripe,
  ProcessadorSimulado,
  type GatewayPagamento,
} from "./pagamento";

/** Variáveis lidas; quem carrega o `.env` é o app (ex.: `process.loadEnvFile`). */
export interface VariaveisPagamento {
  readonly MERCADO_PAGO_ACCESS_TOKEN?: string;
  readonly MERCADO_PAGO_WEBHOOK_SECRET?: string;
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_WEBHOOK_SECRET?: string;
}

export interface GatewaysDoAmbiente {
  /** Pronto para `RecargaService`: sempre tem `simulado`. */
  readonly gateways: Partial<Record<MeioPagamento, GatewayPagamento>>;
  /** Processador do meio simulado, para o app ou o demo "pagar" (`aprovar`). */
  readonly simulador: ProcessadorSimulado;
  /** Segredo de assinatura de cada meio, para gerar o aviso que passa pelo Proxy. */
  readonly segredos: Partial<Record<MeioPagamento, string>>;
  /** Uma linha por processador real: conectado ou o motivo de não ter sido usado. */
  readonly avisos: readonly string[];
}

/** Diz se o token do Mercado Pago é de uma conta de teste (padrão: consulta a conta). */
export type VerificarContaMercadoPago = (token: string) => Promise<boolean>;

const contaDeTeste: VerificarContaMercadoPago = async (token) => {
  const conta = await new User(new MercadoPagoConfig({ accessToken: token })).get();
  return (conta.nickname ?? "").toUpperCase().startsWith("TESTUSER");
};

/**
 * Gateways da recarga a partir do ambiente (#10).
 *
 * O simulado entra sempre, então tudo roda sem internet nem credenciais. Mercado Pago e
 * Stripe só entram com credencial **de teste** no `.env` (que nunca é versionado);
 * credencial de produção é sempre recusada (guia, regra 8).
 * Portado de `src/demo/processadoresReais.ts` da E03, sem carregar o `.env` no import
 * e sem a opção `PERMITIR_PRODUCAO` dos demos da E03.
 */
export async function gatewaysDoAmbiente(
  env: VariaveisPagamento,
  verificarContaMp: VerificarContaMercadoPago = contaDeTeste,
): Promise<GatewaysDoAmbiente> {
  const simulador = new ProcessadorSimulado();
  const segredoSimulado = "segredo-simulado";
  const gateways: Partial<Record<MeioPagamento, GatewayPagamento>> = {
    simulado: new AdaptadorProcessadorSimulado(simulador, segredoSimulado, "Simulado"),
  };
  const segredos: Partial<Record<MeioPagamento, string>> = { simulado: segredoSimulado };
  const avisos: string[] = [];

  const tokenMp = env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!tokenMp) {
    avisos.push("Mercado Pago: não usado (MERCADO_PAGO_ACCESS_TOKEN ausente no .env)");
  } else {
    try {
      // TEST- já é credencial de teste; APP_USR- só se a conta for de um usuário de teste.
      const teste = tokenMp.startsWith("TEST-") || (await verificarContaMp(tokenMp));
      if (teste) {
        const segredo = env.MERCADO_PAGO_WEBHOOK_SECRET ?? "segredo-local-mp";
        gateways.mercadopago = AdaptadorMercadoPago.conectar(tokenMp, segredo);
        segredos.mercadopago = segredo;
        avisos.push("Mercado Pago: conectado (modo de teste)");
      } else {
        avisos.push("Mercado Pago: recusado (token de conta real; use o do vendedor de teste)");
      }
    } catch (erro) {
      avisos.push(`Mercado Pago: não foi possível conectar (${(erro as Error).message})`);
    }
  }

  const chaveStripe = env.STRIPE_SECRET_KEY?.trim();
  if (!chaveStripe) {
    avisos.push("Stripe: não usado (STRIPE_SECRET_KEY ausente no .env)");
  } else {
    // No Stripe, o modo vem na própria chave: sk_test_/rk_test_ são de teste.
    const teste = /^(sk|rk)_test_/.test(chaveStripe);
    if (teste) {
      const segredo = env.STRIPE_WEBHOOK_SECRET ?? "segredo-local-stripe";
      gateways.stripe = AdaptadorStripe.conectar(chaveStripe, segredo);
      segredos.stripe = segredo;
      avisos.push("Stripe: conectado (modo de teste)");
    } else {
      avisos.push("Stripe: recusado (chave LIVE; use a sk_test_)");
    }
  }

  return { gateways, simulador, segredos, avisos };
}
