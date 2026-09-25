import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000/api';
export const OWNER_FILE = '.auth/owner.json';
export const PASSWORD = 'E2eSecret2026';

export interface Creds {
  login: string;
  password: string;
}

export interface ApiSession {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
}

/** Сессия API для подготовки данных — быстрее, чем через интерфейс. */
export async function apiSession(login: string, password: string): Promise<ApiSession> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!res.ok) throw new Error(`login ${login}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await fetch(`${API_URL}${path}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  };
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body ?? {}),
  };
}

export function ownerCreds(): Creds {
  return JSON.parse(readFileSync(OWNER_FILE, 'utf8')) as Creds;
}

export const owner = () => {
  const c = ownerCreds();
  return apiSession(c.login, c.password);
};

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Новый пользователь от имени Владельца. По умолчанию временный пароль сразу меняется,
 * а партнёру включается бесплатный период (без подписки у него только кабинет).
 */
export async function newUser(
  role: 'employee' | 'partner',
  opts: { keepTemporary?: boolean; trial?: boolean } = {},
): Promise<Creds & { id: number; name: string }> {
  const o = await owner();
  const login = `${role.slice(0, 3)}${uid()}`;
  const name = `${role === 'partner' ? 'Партнёр' : 'Сотрудник'} ${login}`;
  const temporaryPassword = 'Temp2026e2e';
  const user = await o.post<{ id: number }>('/users', {
    login,
    displayName: name,
    role,
    temporaryPassword,
  });
  if (opts.keepTemporary) return { id: user.id, login, name, password: temporaryPassword };
  const s = await apiSession(login, temporaryPassword);
  await s.post('/auth/change-password', {
    currentPassword: temporaryPassword,
    newPassword: PASSWORD,
  });
  if (role === 'partner' && opts.trial !== false) {
    const p = await apiSession(login, PASSWORD);
    await p.post('/me/subscription/trial', { scenario: 'success' });
  }
  return { id: user.id, login, name, password: PASSWORD };
}

export async function createListing(title: string): Promise<{ id: number }> {
  const o = await owner();
  return o.post('/listings', { title, price: 99000, currency: 'USD', rooms: 2 });
}

export async function uiLogin(page: Page, creds: Creds): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Логин').fill(creds.login);
  await page.getByLabel('Пароль').fill(creds.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByLabel('Логин')).toBeHidden();
}

/** Пункт меню разделов; на телефоне меню открывается «бургером». */
export async function openSection(page: Page, title: string): Promise<void> {
  const burger = page.getByRole('button', { name: 'Меню' });
  if (await burger.isVisible()) await burger.click();
  await page.getByRole('link', { name: title }).click();
}
