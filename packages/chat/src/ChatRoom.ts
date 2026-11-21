import type {
  MensagemChat,
  ModeracaoPort,
} from "@g6/shared-kernel";
import type { ChatObserver } from "./ChatObserver";
import type { ChatAuditService } from "./ChatAuditService";
import type { QuarantineQueue } from "./QuarantineQueue";

export class ChatRoom {
    private readonly observers: ChatObserver[] = [];

    constructor(
        private readonly moderacao: ModeracaoPort,
        private readonly audit: ChatAuditService,
        private readonly quarantine: QuarantineQueue,
    ){}

    public subscribe(observer: ChatObserver): void {
        if (!this.observers.includes(observer)) {
            this.observers.push(observer);
        }
    }

    public unsubscribe(observer: ChatObserver): void {
        const index = this.observers.indexOf(observer);
        if (index !== -1) {
            this.observers.splice(index, 1);
        }
    }

    public async publish(mensagem: MensagemChat): Promise<void> {
        const veredito = await this.moderacao.avaliar(mensagem);

        this.audit.record(mensagem, veredito);

        switch (veredito.decisao) {
        case "aprovada":
            this.notify(mensagem);
            return;

        case "quarentena":
            this.quarantine.enqueue(mensagem, veredito);
            return;

        case "bloqueada":
            return;

        default:
            throw new Error("Decisão de moderação desconhecida!");
        }
    }

    private notify(mensagem: MensagemChat): void {

        const subscribers = [...this.observers];

        for (const observer of subscribers) {
            observer.update(mensagem);
        }
    }
}