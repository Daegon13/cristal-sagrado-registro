const TRIAL_DATABASE_HOST = 'ep-late-firefly-b6uish7j-pooler.c-2.sa-east-1.aws.neon.tech';
const TRIAL_AUTH_BASE_URL = 'https://ep-late-firefly-b6uish7j.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth';

export function isTrialDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      url.hostname === TRIAL_DATABASE_HOST && url.pathname === '/neondb';
  } catch {
    return false;
  }
}

export function isTrialAuthBaseUrl(value: string | undefined): boolean {
  return value === TRIAL_AUTH_BASE_URL;
}

export function isTrialEnvironmentConfigured(env: Record<string, string | undefined>): boolean {
  return isTrialDatabaseUrl(env.DATABASE_URL) &&
    isTrialAuthBaseUrl(env.NEON_AUTH_BASE_URL) &&
    Boolean(env.NEON_AUTH_COOKIE_SECRET && env.NEON_AUTH_COOKIE_SECRET.length >= 32);
}
