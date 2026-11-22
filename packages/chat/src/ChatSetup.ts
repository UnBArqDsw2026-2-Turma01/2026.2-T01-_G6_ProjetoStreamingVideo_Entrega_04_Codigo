import { ChatDeliveryService } from "./ChatDeliveryService.js";
import { ChatRoom } from "./ChatRoom.js";

export interface ConfiguredChat {
  readonly room: ChatRoom;
  readonly delivery: ChatDeliveryService;
}

export class ChatSetup {
  public configureChat(): ConfiguredChat {
    const delivery = new ChatDeliveryService();
    const room = new ChatRoom();

    return {
      room,
      delivery,
    };
  }
}