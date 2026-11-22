import type { LiveId, MensagemEntregue } from "@g6/shared-kernel";
import type { ChatObserver } from "./ChatObserver.js";

export class ChatRoom {
  private readonly observers = new Map<
    LiveId,
    Array<(mensagem: MensagemEntregue) => void>
  >();
  private readonly falhas: unknown[] = [];

  public subscribe(
    live: LiveId,
    observer: ChatObserver,
  ): () => void {
    const inscritos = this.observers.get(live) ?? [];
    const listener = (mensagem: MensagemEntregue) =>
      observer.update(mensagem);

    inscritos.push(listener);
    this.observers.set(live, inscritos);

    let cancelado = false;
    return () => {
      if (cancelado) return;
      cancelado = true;

      const atuais = this.observers.get(live) ?? [];
      this.observers.set(
        live,
        atuais.filter((inscrito) => inscrito !== listener),
      );
    };
  }

  public subscribeFunction(
    live: LiveId,
    listener: (mensagem: MensagemEntregue) => void,
  ): () => void {
    const inscritos = this.observers.get(live) ?? [];
    inscritos.push(listener);
    this.observers.set(live, inscritos);

    let cancelado = false;
    return () => {
      if (cancelado) return;
      cancelado = true;

      const atuais = this.observers.get(live) ?? [];
      this.observers.set(
        live,
        atuais.filter((inscrito) => inscrito !== listener),
      );
    };
  }

  public publish(live: LiveId, mensagem: MensagemEntregue): void {
    const inscritos = this.observers.get(live) ?? [];

    for (const inscrito of [...inscritos]) {
      try {
        inscrito(mensagem);
      } catch (erro) {
        this.falhas.push(erro);
      }
    }
  }

  get falhasEntrega(): readonly unknown[] {
    return [...this.falhas];
  }
}