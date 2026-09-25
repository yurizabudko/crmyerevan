import { expect, test } from '@playwright/test';
import { createListing, newUser, ownerCreds, uiLogin, uid } from './helpers.js';

test('table search finds a listing; owner can export CSV', async ({ page }) => {
  const title = `E2E таблица ${uid()}`;
  await createListing(title);
  await uiLogin(page, ownerCreds());
  await page.goto('/table');
  await page.getByPlaceholder(/Название, телефон/).fill(title);
  await expect(page.getByRole('cell', { name: title })).toBeVisible();
  await expect(page.getByText('Найдено: 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'CSV' })).toBeVisible();
});

test('partner sees no CSV export, admin or partners sections @mobile', async ({ page }) => {
  const partner = await newUser('partner');
  await uiLogin(page, partner);
  await page.goto('/table');
  await expect(page.getByRole('heading', { name: 'Таблица' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CSV' })).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.getByText('Новые объявления')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Администрирование' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Партнёры' })).toHaveCount(0);
});

test('owner sees partner statistics', async ({ page }) => {
  const partner = await newUser('partner');
  await uiLogin(page, ownerCreds());
  await page.goto('/partners');
  const row = page.getByRole('row', { name: new RegExp(partner.name) });
  await expect(row).toBeVisible();
  await expect(row.getByText('бесплатный период')).toBeVisible();
});
