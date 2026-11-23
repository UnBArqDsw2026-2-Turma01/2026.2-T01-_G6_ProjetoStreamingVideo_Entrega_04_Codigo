import type { ModeracaoPort, MensagemChat, VereditoModeracao } from '@g6/shared-kernel';
import { usuarioId } from '@g6/shared-kernel';
import { IObserver } from '../interfaces.js';
import { StreamEvent } from '../../types/events.js';

/**
 * AutoModObserver (GoF Observer)
 *
 * Observa as mensagens de chat do canal e pede o veredito ao `ModeracaoPort` do
 * shared-kernel. Na E03 este observer tinha uma cópia própria do `TextEntropyAnalyzer`
 * (entropia de Shannon, leetspeak, toxicidade e phishing), que divergiu da cópia do
 * `@g6/moderacao`. Como o canal não pode importar outro contexto (RD3), a análise passa a
 * vir pelo port: quem compõe o canal em `apps/*` injeta o `ModeracaoService` real, e
 * existe uma única implementação do AutoMod no monorepo.
 */
export class AutoModObserver implements IObserver {
  public readonly id: string;
  public readonly name: string;
  public readonly targetSystem = 'AutoMod (ModeracaoPort)';
  private totalFilteredMessages = 0;
  private readonly inspectionLogs: Array<{ text: string; decisao: VereditoModeracao['decisao']; violations: string[] }> = [];

  constructor(
    private readonly moderacao: ModeracaoPort,
    id: string = 'obs-automod',
    name: string = 'AutoMod',
  ) {
    this.id = id;
    this.name = name;
  }

  async update(event: StreamEvent): Promise<void> {
    if (event.type !== 'CHAT_MESSAGE_SENT' || !event.moderationInfo) return;

    const texto = event.moderationInfo.detectedEntity;
    const autor = event.moderationInfo.authorId ?? 'anonimo';
    const mensagem: MensagemChat = {
      id: `${event.channelId}:${event.timestamp.getTime()}`,
      autor: usuarioId(autor),
      nomeAutor: autor,
      texto,
      em: event.timestamp,
    };

    const veredito = await this.moderacao.avaliar(mensagem);
    if (veredito.decisao === 'aprovada') return;

    this.totalFilteredMessages++;
    this.inspectionLogs.push({ text: texto, decisao: veredito.decisao, violations: [veredito.motivo] });
    console.log(
      `\x1b[33m[AutoMod]\x1b[0m 🛡 Mensagem retida no canal [@${event.channelId}]: "${texto}" ` +
        `→ ${veredito.decisao} (${veredito.motivo})`,
    );
  }

  public getFilteredCount(): number {
    return this.totalFilteredMessages;
  }

  public getLogs() {
    return [...this.inspectionLogs];
  }
}
