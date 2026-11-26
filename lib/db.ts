import 'server-only';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { isTrialDatabaseUrl } from '@/lib/experiment-env';

neonConfig.webSocketConstructor = ws;
let pool: Pool | undefined;
export function database(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!isTrialDatabaseUrl(url)) throw new Error('TRIAL_DATABASE_MISMATCH');
  if (!pool) pool = new Pool({ connectionString: url, max: 5 });
  return pool;
}
