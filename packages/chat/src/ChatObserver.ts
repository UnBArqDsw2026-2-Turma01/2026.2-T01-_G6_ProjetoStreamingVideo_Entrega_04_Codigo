import type { MensagemChat } from "@g6/shared-kernel";

export interface ChatObserver {
    update(message: MensagemChat): void;
}

/** @deprecated Use ChatObserver. */
export type ChatObserve = ChatObserver;