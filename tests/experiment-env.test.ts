import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isTrialAuthBaseUrl, isTrialDatabaseUrl, isTrialEnvironmentConfigured } from '../lib/experiment-env.ts';

const database = 'postgresql://qa:synthetic@ep-late-firefly-b6uish7j-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require';
const auth = 'https://ep-late-firefly-b6uish7j.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth';

test('el entorno Netlify rechaza ramas ajenas antes de autenticar o abrir la base', () => {
  assert.equal(isTrialDatabaseUrl(database), true);
  assert.equal(isTrialDatabaseUrl(database.replace('-pooler', '')), false);
  assert.equal(isTrialDatabaseUrl(database.replace('late-firefly', 'small-tooth')), false);
  assert.equal(isTrialAuthBaseUrl(auth), true);
  assert.equal(isTrialAuthBaseUrl('https://ep-small-tooth-b6n0ag36.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth'), false);
  assert.equal(isTrialEnvironmentConfigured({ DATABASE_URL: database, NEON_AUTH_BASE_URL: auth, NEON_AUTH_COOKIE_SECRET: 'x'.repeat(32) }), true);
  assert.equal(isTrialEnvironmentConfigured({ DATABASE_URL: database, NEON_AUTH_BASE_URL: auth, NEON_AUTH_COOKIE_SECRET: 'short' }), false);
});
