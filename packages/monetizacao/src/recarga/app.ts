import type { EventBus, UsuarioId } from "@g6/shared-kernel";
import { RepositorioEmMemoria } from "../comum/compartilhado";
import { Usuario } from "../comum/dominio";
import { ServicoFinanceiro } from "../comum/financeiro";
import type { GatewaysDoAmbiente } from "./gatewaysDoAmbiente";
import { RecargaService } from "./RecargaService";

export interface AppRecarga {
  readonly servico: RecargaService;
  garantirUsuario(usuario: UsuarioId | string): void;
}

/**
 * Fábrica da recarga para os apps (`apps/web`).
 * Instancia repositórios em memória, serviço financeiro e RecargaService com os gateways configurados.
 */
export function criarRecargaDoApp(pagamentos: GatewaysDoAmbiente, bus?: EventBus): AppRecarga {
  const usuarios = new RepositorioEmMemoria<Usuario>();
  const financeiro = new ServicoFinanceiro();
  const servico = new RecargaService({
    gateways: pagamentos.gateways,
    financeiro,
    usuarios,
    eventos: bus,
    simulador: pagamentos.simulador,
    segredos: pagamentos.segredos,
  });

  return {
    servico,
    garantirUsuario: (usuarioId: UsuarioId | string) => {
      const id = String(usuarioId);
      if (!usuarios.buscarPorId(id)) {
        usuarios.salvar(new Usuario(id, id, `${id}@exemplo.com`));
      }
    },
  };
}
