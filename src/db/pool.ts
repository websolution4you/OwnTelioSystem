import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = env.DATABASE_URL
  ? new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 })
  : null;

export function requirePool(): pg.Pool {
  if (!pool) throw new Error('DATABASE_URL is required for booking operations');
  return pool;
}
