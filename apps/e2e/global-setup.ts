import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { API_URL, OWNER_FILE, PASSWORD, apiSession } from './tests/helpers.js';

/** Владелец для тестов создаётся той же командой, что и в продакшене (create-owner). */
export default async function globalSetup(): Promise<void> {
  const login = `e2e${Date.now().toString(36)}`;
  const out = execFileSync(
    'node',
    ['--env-file-if-exists=../../.env', '../api/dist/cli/create-owner.js', login, 'E2E Владелец'],
    { encoding: 'utf8' },
  );
  const temporary = /Временный пароль: (\S+)/.exec(out)?.[1];
  if (!temporary) throw new Error(`create-owner: не найден пароль в выводе:\n${out}`);

  const owner = await apiSession(login, temporary);
  await owner.post('/auth/change-password', { currentPassword: temporary, newPassword: PASSWORD });

  mkdirSync('.auth', { recursive: true });
  writeFileSync(OWNER_FILE, JSON.stringify({ login, password: PASSWORD, apiUrl: API_URL }));
}
