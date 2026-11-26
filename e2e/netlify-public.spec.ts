import { expect, test } from '@playwright/test';

const base = process.env.NETLIFY_PUBLIC_URL;

test('Netlify público: login móvil y API sin sesión', async ({ page, request }) => {
  test.skip(!base, 'NETLIFY_PUBLIC_URL no está configurada');

  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const navigation = await page.goto(base!, { waitUntil: 'networkidle' });
  expect(navigation?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Registro privado' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(pageErrors).toEqual([]);

  const health = await request.get(new URL('/api/health', base).toString());
  expect(health.status()).toBe(200);
  expect((await health.json()).configured).toBe(true);
  expect(health.headers()['cache-control']).toBe('no-store');

  for (const path of ['/api/me', '/api/data?table=contacts', '/api/export?format=json']) {
    const response = await request.get(new URL(path, base).toString());
    expect(response.status(), path).toBe(401);
    expect(response.headers()['cache-control'], path).toBe('no-store');
  }
});

test('Neon Auth rechaza credenciales ficticias por identidad, sin error de origen', async ({ page }) => {
  test.skip(!base, 'NETLIFY_PUBLIC_URL no está configurada');

  await page.goto(base!);
  await page.getByRole('heading', { name: 'Registro privado' }).waitFor();
  await page.getByLabel('Correo electrónico').fill('qa-netlify-no-user@example.invalid');
  await page.getByText('Usar contraseña si ya tenés una').click();
  await page.getByLabel('Si ya tenés contraseña').fill('invalid-password');
  const responsePromise = page.waitForResponse(response => response.url().includes('/api/auth/sign-in/email'));
  await page.getByRole('button', { name: 'Entrar con contraseña' }).click();
  const response = await responsePromise;
  const body = await response.json();
  expect(body.code, JSON.stringify(body)).not.toBe('INVALID_ORIGIN');
  expect(response.status()).toBeGreaterThanOrEqual(400);
});
