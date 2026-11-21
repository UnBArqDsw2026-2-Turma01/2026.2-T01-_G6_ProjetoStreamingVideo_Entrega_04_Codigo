import type {
  MensagemChat,
  VereditoModeracao,
} from "@g6/shared-kernel";

export interface QuarantineEntry {
  readonly message: Readonly<MensagemChat>;
  readonly verdict: Readonly<VereditoModeracao>;
  readonly enqueuedAt: string;
}

export class QuarantineQueue {
  private readonly entries: QuarantineEntry[] = [];

  public enqueue(
    message: MensagemChat,
    veredito: VereditoModeracao,
  ): void {
    if (veredito.decisao !== "quarentena") {
        throw new Error(
        "A quarentena aceita somente mensagens com decisão 'quarentena'.",
        );
    }

    const entry: QuarantineEntry = Object.freeze({
      message: Object.freeze({ ...message }),
      verdict: Object.freeze({ ...veredito }),
      enqueuedAt: new Date().toISOString(),
    });

    this.entries.push(entry);
  }

  public getEntries(): ReadonlyArray<QuarantineEntry> {
    return [...this.entries];
  }
}