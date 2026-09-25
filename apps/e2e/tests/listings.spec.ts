import { expect, test } from '@playwright/test';
import { createListing, newUser, ownerCreds, uiLogin, uid } from './helpers.js';

test('owner adds a listing, moves it to «Звонок» and comments', async ({ page }) => {
  const title = `E2E квартира ${uid()}`;
  await uiLogin(page, ownerCreds());
  await page.goto('/listings');

  await page.getByRole('button', { name: 'Добавить' }).click();
  const modal = page.getByRole('dialog', { name: 'Новое объявление' });
  await modal.getByLabel('Название').fill(title);
  await modal.getByLabel('Цена').fill('120000');
  await modal.getByLabel('Телефон').fill('+374 91 555 111');
  await modal.getByRole('button', { name: 'Добавить' }).click();
  await expect(modal).toBeHidden();

  await page.getByRole('button', { name: title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Объявление' });
  await drawer.getByRole('button', { name: 'Новое объявление' }).click();
  await page.getByRole('menuitem', { name: 'Звонок' }).click();
  await expect(drawer.getByRole('button', { name: 'Звонок' })).toBeVisible();

  await drawer.getByPlaceholder('Комментарий…').fill('Собственник на связи после 18:00');
  await drawer.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(drawer.getByText('Собственник на связи после 18:00')).toBeVisible();
});

test('a partner claims a new listing and other partners stop seeing it @mobile', async ({
  browser,
}) => {
  const title = `E2E пул ${uid()}`;
  await createListing(title);
  const [first, second] = [await newUser('partner'), await newUser('partner')];

  const a = await browser.newPage();
  const b = await browser.newPage();
  await uiLogin(a, first);
  await uiLogin(b, second);
  await b.goto('/listings');
  await expect(b.getByRole('button', { name: title, exact: true })).toBeVisible();

  await a.goto('/listings');
  await a.getByRole('button', { name: title, exact: true }).click();
  const drawer = a.getByRole('dialog', { name: 'Объявление' });
  await drawer.getByRole('button', { name: 'Новое объявление' }).click();
  await a.getByRole('menuitem', { name: 'Звонок' }).click();
  await expect(drawer.getByRole('button', { name: 'Звонок' })).toBeVisible();
  await expect(drawer.getByText(first.name).first()).toBeVisible();

  await b.reload();
  await expect(b.getByRole('heading', { name: 'Воронка объявлений' })).toBeVisible();
  await expect(b.getByRole('button', { name: title, exact: true })).toHaveCount(0);
});
