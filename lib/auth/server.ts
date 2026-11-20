import 'server-only';
import { createNeonAuth } from '@neon/auth/next/server';

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL || 'http://localhost:3000/unconfigured',
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET || 'unconfigured-cookie-secret-must-not-be-used', sessionDataTtl: 30 },
  logLevel: 'warn',
});
