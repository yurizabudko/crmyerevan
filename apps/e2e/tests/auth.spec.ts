import { expect, test } from '@playwright/test';
import { newUser, openSection, ownerCreds, uiLogin } from './helpers.js';

test('wrong password is rejected', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин').fill(ownerCreds().login);
  await page.getByLabel('Пароль').fill('WrongPassword1');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText(/неверный логин или пароль/i)).toBeVisible();
});

test('new partner changes the temporary password and starts a trial @mobile', async ({ page }) => {
  const partner = await newUser('partner', { keepTemporary: true });
  await uiLogin(page, partner);

  await expect(page.getByRole('heading', { name: 'Смена пароля' })).toBeVisible();
  await page.getByLabel('Временный пароль').fill(partner.password);
  await page.getByLabel('Новый пароль', { exact: true }).fill('NewPass2026e2e');
  await page.getByLabel('Повторите пароль').fill('NewPass2026e2e');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  // Без подписки партнёр попадает в кабинет, откуда бы ни пришёл.
  await expect(page).toHaveURL(/\/cabinet$/);
  await page.goto('/listings');
  await expect(page).toHaveURL(/\/cabinet$/);
  await expect(page.getByText('не активирована', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Начать бесплатный период' }).click();
  await expect(page.getByText(/До конца бесплатного периода/)).toBeVisible();
  await expect(page.getByText('**** 4242')).toBeVisible();

  await openSection(page, 'Воронка объявлений');
  await expect(page.getByRole('heading', { name: 'Воронка объявлений' })).toBeVisible();
});

test('logout returns to the login screen', async ({ page }) => {
  await uiLogin(page, ownerCreds());
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByLabel('Логин')).toBeVisible();
  await page.goto('/table');
  await expect(page.getByLabel('Логин')).toBeVisible();
});
