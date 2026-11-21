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

import { ChatAuditService } from "./ChatAuditService";
import { QuarantineQueue } from "./QuarantineQueue";

export interface DependenciasChatService {
  readonly moderacao: ModeracaoPort;
  readonly eventos: EventBus;
}

export class ChatService implements ChatPort {
  private readonly inscritos = new Map<
    LiveId,
    Array<(mensagem: MensagemEntregue) => void>
  >();

  private readonly auditoria = new ChatAuditService();
  private readonly quarentena = new QuarantineQueue();

  constructor(private readonly dependencias: DependenciasChatService) {}

  inscrever(
    live: LiveId,
    ouvinte: (mensagem: MensagemEntregue) => void,
  ): Cancelamento {
    const lista = this.inscritos.get(live) ?? [];
    lista.push(ouvinte);
    this.inscritos.set(live, lista);

    let cancelado = false;

    return () => {
      if (cancelado) return;
      cancelado = true;

      const atuais = this.inscritos.get(live) ?? [];
      this.inscritos.set(
        live,
        atuais.filter((inscrito) => inscrito !== ouvinte),
      );
    };
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

  async publicar(
    live: LiveId,
    mensagem: MensagemChat,
  ): Promise<Resultado<void>> {
    const resultado = await this.processar(mensagem);

    if (!resultado.ok) {
      return resultado;
    }

    const entregue: MensagemEntregue = {
      live,
      destacada: false,
      mensagem,
    };

    const inscritos = this.inscritos.get(live) ?? [];

    for (const ouvinte of [...inscritos]) {
      ouvinte(entregue);
    }

    this.dependencias.eventos.publicar({
      tipo: "MensagemPublicada",
      live,
      autor: mensagem.autor,
      destacada: false,
      em: new Date(),
    });

    return { ok: true, valor: undefined };
  }

  async publicarDestacada(
    live: LiveId,
    mensagem: MensagemDestacada,
  ): Promise<Resultado<void>> {
    const resultado = await this.processar(mensagem);

    if (!resultado.ok) {
      return resultado;
    }

    const entregue: MensagemEntregue = {
      live,
      destacada: true,
      mensagem,
    };

    const inscritos = this.inscritos.get(live) ?? [];

    for (const ouvinte of [...inscritos]) {
      ouvinte(entregue);
    }

    this.dependencias.eventos.publicar({
      tipo: "MensagemPublicada",
      live,
      autor: mensagem.autor,
      destacada: true,
      em: new Date(),
    });

    return { ok: true, valor: undefined };
  }

  get registrosAuditoria() {
    return this.auditoria.getRecords();
  }

  get entradasQuarentena() {
    return this.quarentena.getEntries();
  }
}