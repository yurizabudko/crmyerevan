import { NocoDbError } from './errors.js';

export type Auth = { apiToken: string } | { jwt: string };

export interface HttpOptions {
  baseUrl: string;
  auth?: Auth;
  /** Повторы при 429/5xx и сетевых ошибках. */
  retries?: number;
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | undefined>;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export class Http {
  private readonly baseUrl: string;
  private readonly retries: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.retries = options.retries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const auth = this.options.auth;
    if (auth && 'apiToken' in auth) headers['xc-token'] = auth.apiToken;
    if (auth && 'jwt' in auth) headers['xc-auth'] = auth.jwt;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (attempt < this.retries) {
          await delay(backoffMs(attempt));
          continue;
        }
        throw error;
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.retries) {
        await delay(backoffMs(attempt));
        continue;
      }

      const text = await response.text();
      const parsed: unknown = text ? safeJson(text) : undefined;
      if (!response.ok) {
        const msg =
          (parsed as { msg?: string; message?: string } | undefined)?.msg ??
          (parsed as { message?: string } | undefined)?.message ??
          response.statusText;
        throw new NocoDbError(
          `${method} ${path} → ${response.status}: ${msg}`,
          response.status,
          parsed,
        );
      }
      return parsed as T;
    }
  }
}

function backoffMs(attempt: number): number {
  return 200 * 2 ** attempt;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
