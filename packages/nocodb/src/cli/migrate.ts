import { NocoDb } from '../client.js';
import { Http } from '../http.js';
import { MetaApi, issueApiToken } from '../meta.js';
import { migrateSchema } from '../migrate.js';
import { seed } from '../seed.js';

function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

async function main(): Promise<void> {
  const baseUrl = env('NOCODB_URL');
  const baseTitle = env('NOCODB_BASE_TITLE', 'crm');

  let apiToken = process.env.NOCODB_API_TOKEN;
  if (!apiToken) {
    // Первый запуск: выпускаем токен от имени администратора NocoDB.
    apiToken = await issueApiToken(
      baseUrl,
      env('NC_ADMIN_EMAIL'),
      env('NC_ADMIN_PASSWORD'),
      'crm-app',
    );
    console.log('Выпущен API-токен NocoDB. Сохраните его в .env:');
    console.log(`NOCODB_API_TOKEN=${apiToken}`);
  }

  const meta = new MetaApi(new Http({ baseUrl, auth: { apiToken } }));
  const report = await migrateSchema(meta, baseTitle);
  console.log(
    `Схема: база ${report.createdBase ? 'создана' : 'есть'}, ` +
      `таблиц создано ${report.createdTables.length}, колонок добавлено ${report.addedColumns.length}`,
  );
  for (const item of [...report.createdTables, ...report.addedColumns]) console.log(`  + ${item}`);

  const db = await NocoDb.connect({ baseUrl, apiToken, baseTitle });
  const seeded = await seed(db);
  console.log(
    `Сиды: этапов ${seeded.stages}, элементов справочников ${seeded.dictionaryItems}, ` +
      `настроек ${seeded.settings.length}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
