import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = env.DATABASE_URL
  ? new Pool({
      connectionString: env.DATABASE_URL,
      application_name: 'own-telio-voice',
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 10_000,
      statement_timeout: 8_000,
    })
  : null;

export function requirePool(): pg.Pool {
  if (!pool) throw new Error('DATABASE_URL is required for booking operations');
  return pool;
}
