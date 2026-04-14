/**
 * 异步消息总线简化版
 * 对应原项目：utils/mailbox.ts, context/mailbox.tsx
 */

import type { Message } from './types.js';

export type MailboxSubscriber = (messages: Message[]) => void;

export class Mailbox {
  private messages: Message[] = [];
  private subscribers = new Set<MailboxSubscriber>();

  send(msg: Message): void {
    this.messages.push(msg);
    this.subscribers.forEach((sub) => sub([...this.messages]));
  }

  poll(filter: (msg: Message) => boolean): Message | undefined {
    return this.messages.find(filter);
  }

  async receive(filter: (msg: Message) => boolean): Promise<Message> {
    const existing = this.messages.find(filter);
    if (existing) return existing;

    return new Promise((resolve) => {
      const sub: MailboxSubscriber = (msgs) => {
        const matched = msgs.find(filter);
        if (matched) {
          this.subscribers.delete(sub);
          resolve(matched);
        }
      };
      this.subscribers.add(sub);
    });
  }

  subscribe(sub: MailboxSubscriber): () => void {
    this.subscribers.add(sub);
    sub([...this.messages]);
    return () => this.subscribers.delete(sub);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }
}
