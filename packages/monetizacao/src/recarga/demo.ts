/**
 * Demonstração da recarga pelo `RecargaPort`, sem internet e sem credenciais (#10).
 *
 * Mostra os três padrões da E03 atrás do contrato do kernel: as ofertas do modal
 * (Decorator), o checkout no meio escolhido e a indisponibilidade (Adapter) e os
 * avisos de pagamento barrados ou aceitos (Proxy).
 *
 * Executar: npm run demo:recarga -w @g6/monetizacao
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { EventBusEmMemoria, pacoteId, usuarioId, type EventoDominio, type Sessao } from "@g6/shared-kernel";
import { RepositorioEmMemoria } from "../comum/compartilhado";
import { Dinheiro, Usuario } from "../comum/dominio";
import { ServicoFinanceiro } from "../comum/financeiro";
import { gatewaysDoAmbiente } from "./gatewaysDoAmbiente";
import { assinarNotificacao, type NotificacaoPagamento } from "./pagamento";
import { RecargaService } from "./RecargaService";

const reais = (centavos: number) => Dinheiro.deCentavos(centavos).formatar();

function aviso(segredo: string, idEvento: string, idPagamento: string, recargaId: string): NotificacaoPagamento {
  const dados = { idEvento, idPagamento, recargaId };
  return { ...dados, assinatura: assinarNotificacao(segredo, dados) };
}

async function main(): Promise<void> {
  // O .env fica na raiz do repositório e é opcional: sem ele, só o simulado.
  const env = resolve(__dirname, "../../../../.env");
  if (existsSync(env)) process.loadEnvFile(env);

  console.log("=== Recarga de moeda virtual pelo RecargaPort ===\n");
  const { gateways, simulador, segredos, avisos } = await gatewaysDoAmbiente(process.env);
  console.log("Meios de pagamento:");
  console.log("  Simulado: sempre disponível");
  for (const linha of avisos) console.log(`  ${linha}`);

  const usuarios = new RepositorioEmMemoria<Usuario>();
  const espectador = new Usuario("usr_espectador", "Espectador", "espectador@exemplo.com");
  usuarios.salvar(espectador);
  const eventos = new EventBusEmMemoria();
  const publicados: EventoDominio[] = [];
  eventos.assinar("RecargaConcluida", (evento) => publicados.push(evento));
  const recarga = new RecargaService({
    gateways,
    financeiro: new ServicoFinanceiro(),
    usuarios,
    eventos,
  });
  const sessao: Sessao = { usuarioId: usuarioId(espectador.id), papel: "espectador", token: "demo", expiraEm: new Date() };

  console.log("\n[Decorator] Ofertas do modal:");
  const ofertas = await recarga.ofertas(sessao);
  if (!ofertas.ok) throw new Error(ofertas.erro.mensagem);
  for (const o of ofertas.valor) {
    console.log(`  ${o.moeda} de moeda virtual: de ${reais(o.precoSemDescontoCentavos)} por ${reais(o.precoCentavos)}`);
  }
  const pacote = pacoteId(ofertas.valor[1]?.pacote ?? ofertas.valor[0].pacote);

  console.log("\n[Adapter] Simulado fora do ar:");
  simulador.online = false;
  const fora = await recarga.recarregar(sessao, pacote, "simulado");
  console.log(`  ${fora.ok ? "inesperado" : `${fora.erro.codigo}: ${fora.erro.mensagem}`}`);
  simulador.online = true;

  console.log("\n[Adapter] Simulado de volta; espectador compra o pacote:");
  const pedido = await recarga.recarregar(sessao, pacote, "simulado");
  if (!pedido.ok) throw new Error(pedido.erro.mensagem);
  const checkout = pedido.valor;
  console.log(`  ${checkout.recargaId}: ${reais(checkout.valorCobradoCentavos)} no ${checkout.meio} (${checkout.instrucoes})`);
  console.log(`  saldo: ${espectador.carteira.saldoMoedaVirtual} (recarregar não credita)`);

  // O espectador lê o protocolo na tela do simulado; o processador avisa pelo webhook.
  const idPagamento = checkout.instrucoes.replace("pague o protocolo ", "");
  const segredo = segredos.simulado!;
  console.log("\n[Proxy] Avisos de pagamento:");
  const casos: [string, NotificacaoPagamento, (() => void)?][] = [
    ["aviso falsificado (O14)", aviso("segredo-do-atacante", "ev-0", idPagamento, checkout.recargaId)],
    ["aviso antes do pagamento", aviso(segredo, "ev-1", idPagamento, checkout.recargaId)],
    ["aviso após o pagamento", aviso(segredo, "ev-2", idPagamento, checkout.recargaId), () => simulador.aprovar(idPagamento)],
    ["reenvio do mesmo aviso (O11)", aviso(segredo, "ev-3", idPagamento, checkout.recargaId)],
  ];
  for (const [descricao, notificacao, antes] of casos) {
    antes?.();
    const r = await recarga.receberAviso("simulado", notificacao);
    console.log(`  ${descricao}: ${r.efeito}`);
  }

  const situacao = await recarga.consultar(sessao, checkout.recargaId);
  console.log(`\nconsultar(${checkout.recargaId}): ${situacao.ok ? situacao.valor.situacao : situacao.erro.codigo}`);
  console.log(`eventos publicados: ${publicados.map((e) => e.tipo).join(", ") || "nenhum"}`);
  console.log(`saldo final: ${espectador.carteira.saldoMoedaVirtual} de moeda virtual`);
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
