import { test, expect } from '@playwright/test';

const email = process.env.POS_E2E_ADMIN_EMAIL;
const password = process.env.POS_E2E_ADMIN_PASSWORD;

test.skip(!email || !password, 'Set staging admin credentials for the Company Setup acceptance test.');

test('admin can inspect the company setup sections without exposing company data', async ({ page }) => {
  await page.goto('/');
  await page.locator('#current-email').fill(email);
  await page.locator('#current-password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await expect(page.getByText(/admin/i).first()).toBeVisible({ timeout: 15_000 });
  await page.goto('/#admin/company');
  await expect(page.getByRole('heading', { name: 'Company Setup' })).toBeVisible({ timeout: 15_000 });
  for (const label of ['General', 'Tax & Finance', 'Contact & Address', 'Receipt', 'E-Invoice', 'Branches']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Branches', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company branches' })).toBeVisible();
});
