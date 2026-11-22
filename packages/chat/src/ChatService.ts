import type {
  Cancelamento,
  ChatPort,
  EventBus,
  LiveId,
  MensagemChat,
  MensagemDestacada,
  MensagemEntregue,
  ModeracaoPort,
  Resultado,
} from "@g6/shared-kernel";

import { ChatAuditService } from "./ChatAuditService.js";
import { ChatRoom } from "./ChatRoom.js";
import { QuarantineQueue } from "./QuarantineQueue.js";

export interface DependenciasChatService {
  readonly moderacao: ModeracaoPort;
  readonly eventos: EventBus;
}

export class ChatService implements ChatPort {
  private readonly auditoria = new ChatAuditService();
  private readonly quarentena = new QuarantineQueue();
  private readonly sala = new ChatRoom();

  constructor(private readonly dependencias: DependenciasChatService) {}

  inscrever(
    live: LiveId,
    ouvinte: (mensagem: MensagemEntregue) => void,
  ): Cancelamento {
    return this.sala.subscribeFunction(live, ouvinte);
  }

  private async processar(
    mensagem: MensagemChat,
  ): Promise<Resultado<void>> {
    const veredito =
      await this.dependencias.moderacao.avaliar(mensagem);

    this.auditoria.record(mensagem, veredito);

    switch (veredito.decisao) {
      case "aprovada":
        return { ok: true, valor: undefined };

      case "quarentena":
        this.quarentena.enqueue(mensagem, veredito);

        return {
          ok: false,
          erro: {
            codigo: "MENSAGEM_EM_QUARENTENA",
            mensagem: veredito.motivo,
          },
        };

      case "bloqueada":
        return {
          ok: false,
          erro: {
            codigo: "MENSAGEM_BLOQUEADA",
            mensagem: veredito.motivo,
          },
        };
    }
  }

  private async publicarMensagem(
    live: LiveId,
    entregue: MensagemEntregue,
  ): Promise<Resultado<void>> {
    const mensagem = entregue.mensagem;
    const resultado = await this.processar(mensagem);

    if (!resultado.ok) {
      return resultado;
    }

    this.sala.publish(live, entregue);

    this.dependencias.eventos.publicar({
      tipo: "MensagemPublicada",
      live,
      autor: mensagem.autor,
      destacada: entregue.destacada,
      em: new Date(),
    });

    return { ok: true, valor: undefined };
  }

  async publicar(
    live: LiveId,
    mensagem: MensagemChat,
  ): Promise<Resultado<void>> {
    return this.publicarMensagem(live, {
      live,
      destacada: false,
      mensagem,
    });
  }

  async publicarDestacada(
    live: LiveId,
    mensagem: MensagemDestacada,
  ): Promise<Resultado<void>> {
    return this.publicarMensagem(live, {
      live,
      destacada: true,
      mensagem,
    });
  }

  get registrosAuditoria() {
    return this.auditoria.getRecords();
  }

  get entradasQuarentena() {
    return this.quarentena.getEntries();
  }

  get falhasEntrega() {
    return this.sala.falhasEntrega;
  }
}