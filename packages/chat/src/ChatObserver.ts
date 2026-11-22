import type { MensagemEntregue } from "@g6/shared-kernel";

export interface ChatObserver {
  update(message: MensagemEntregue): void;
}

/** @deprecated Use ChatObserver. */
export type ChatObserve = ChatObserver;