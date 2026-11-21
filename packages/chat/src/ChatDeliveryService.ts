import type { MensagemChat } from "@g6/shared-kernel";
import type { ChatObserver } from "./ChatObserver";

export class ChatDeliveryService implements ChatObserver {
    public update(mensagem: MensagemChat): void {
        console.log(
            `[Chat] ${mensagem.id} ${mensagem.nomeAutor}: ${mensagem.texto}`,
        );
    }
}