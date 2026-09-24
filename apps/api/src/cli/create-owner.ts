import { randomBytes } from 'node:crypto';
import { NocoDb } from '@crm/nocodb';
import { loginSchema } from '@crm/shared';
import { hashPassword } from '../auth/password.js';
import { loadConfig } from '../config.js';
import { UsersRepository } from '../users/users.repository.js';

/**
 * Создание первой учётной записи Владельца (саморегистрации нет, БТ-2.4.1):
 *   pnpm --filter @crm/api create-owner <логин> "<Имя>"
 * Печатает временный пароль, который нужно сменить при первом входе.
 */
async function main(): Promise<void> {
  const [rawLogin, displayName = 'Владелец'] = process.argv.slice(2);
  const login = loginSchema.parse(rawLogin ?? '');
  const config = loadConfig();
  const db = await NocoDb.connect({
    baseUrl: config.NOCODB_URL,
    apiToken: config.NOCODB_API_TOKEN,
    baseTitle: config.NOCODB_BASE_TITLE,
  });
  const users = new UsersRepository(db);
  if (await users.findByLogin(login)) {
    throw new Error(`Пользователь ${login} уже существует`);
  }
  // Буквы и цифры гарантированы префиксом, чтобы пароль прошёл политику БТ-2.4.4.
  const temporaryPassword = `Tmp${randomBytes(6).toString('hex')}7`;
  await users.create({
    login,
    displayName,
    role: 'owner',
    passwordHash: await hashPassword(temporaryPassword),
    perms: { grantAccess: true, deleteCards: true, manageDictionaries: true },
    createdById: null,
  });
  console.log(`Владелец ${login} создан. Временный пароль: ${temporaryPassword}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
