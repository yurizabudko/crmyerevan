/** Минимальный клиент Telegram Bot API (НФТ-8). */
export interface TelegramApi {
  readonly enabled: boolean;
  sendMessage(chatId: string, text: string): Promise<void>;
  getUpdates(offset: number): Promise<TelegramUpdate[]>;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
}

export const TELEGRAM_API = Symbol('TELEGRAM_API');

export class TelegramClient implements TelegramApi {
  constructor(private readonly token: string | undefined) {}

  get enabled(): boolean {
    return Boolean(this.token);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
  }

  async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 0,
      allowed_updates: ['message'],
    });
  }

  private async call<T>(method: string, body: object): Promise<T> {
    if (!this.token) throw new Error('Telegram-бот не настроен (TELEGRAM_BOT_TOKEN)');
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { ok: boolean; result: T; description?: string };
    // Токен бота не попадает в текст ошибки и логи.
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
    return data.result;
  }
}
