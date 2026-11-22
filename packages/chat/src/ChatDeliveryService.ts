import type { MensagemEntregue } from "@g6/shared-kernel";
import type { ChatObserver } from "./ChatObserver.js";

export class ChatDeliveryService implements ChatObserver {
    public update(entregue: MensagemEntregue): void {
        const mensagem = entregue.mensagem;
        console.log(
            `[Chat] ${mensagem.id} ${mensagem.nomeAutor}: ${mensagem.texto}`,
        );
    }
}