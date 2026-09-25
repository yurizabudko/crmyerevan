import { expect, test } from '@playwright/test';
import { ownerCreds, uiLogin, uid } from './helpers.js';

test('client phone is unique: the second card is refused with a link to the first', async ({
  page,
}) => {
  const name = `E2E клиент ${uid()}`;
  const phone = `+37477${String(Date.now()).slice(-6)}`;
  await uiLogin(page, ownerCreds());
  await page.goto('/clients');

  const add = async (clientName: string) => {
    await page.getByRole('button', { name: 'Добавить' }).click();
    const modal = page.getByRole('dialog', { name: 'Новый клиент' });
    await modal.getByLabel('Имя').fill(clientName);
    await modal.getByLabel('Телефон').fill(phone);
    await modal.getByLabel('Источник').click();
    await page.getByRole('option').first().click();
    await modal.getByRole('button', { name: 'Добавить' }).click();
    return modal;
  };

  const first = await add(name);
  await expect(first).toBeHidden();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();

  const second = await add(`${name} дубль`);
  await expect(second.getByText('Открыть карточку')).toBeVisible();
  await second.getByText('Открыть карточку').click();
  await expect(page.getByRole('dialog', { name: 'Клиент' }).getByText(name).first()).toBeVisible();
});
