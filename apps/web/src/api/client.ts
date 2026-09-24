import type { ApiErrorBody } from '@crm/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    super(message || `Ошибка ${status}`);
  }

  get code(): string | undefined {
    return this.body.code;
  }
}

/** Запрос к API с cookie-сессией. Ошибки превращаются в ApiError с телом ответа. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, (data ?? {}) as ApiErrorBody);
  return data as T;
}

/** Загрузка файлов (multipart). Content-Type с границей выставит браузер. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, (data ?? {}) as ApiErrorBody);
  return data as T;
}
