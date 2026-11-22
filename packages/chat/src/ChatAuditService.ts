import type {
  MensagemChat,
  VereditoModeracao,
} from "@g6/shared-kernel";

export interface ChatAuditRecord {
    readonly message: Readonly<MensagemChat>;
    readonly verdict: Readonly<VereditoModeracao>;
    readonly recordedAt: string;
}

export class ChatAuditService {
    private readonly records: ChatAuditRecord[] = [];

    public record(
        mensagem: MensagemChat,
        veredito: VereditoModeracao,
    ): void {
        const entry: ChatAuditRecord = Object.freeze({
            message: Object.freeze({ ...mensagem }),
            verdict: Object.freeze({ ...veredito }),
            recordedAt: new Date().toISOString(),
        });

        this.records.push(entry);
    }

    public getRecords(): ReadonlyArray<ChatAuditRecord> {
        return [...this.records];
    }
}