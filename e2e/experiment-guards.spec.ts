import { test, expect } from '@playwright/test';

const base = process.env.EXPERIMENT_GUARD_URL;

test('el ensayo bloquea cron y envío de informes antes de acceder a credenciales', async ({ request }) => {
  if (!base) { test.skip(); return; }
  const cron = await request.get(new URL('/api/cron/weekly', base).toString());
  expect(cron.status()).toBe(503);
  const send = await request.post(new URL('/api/reports/send', base).toString(), {
    headers: { origin: new URL(base).origin },
    data: { start: '2026-11-23', end: '2026-11-23' },
  });
  expect(send.status()).toBe(503);
});
