import pg from 'pg';
import { env } from '../config/env.js';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
const { Client } = pg;
const client = new Client({
  connectionString: env.DATABASE_URL,
  application_name: 'own-telio-schema-audit',
  statement_timeout: 5_000,
  query_timeout: 7_000,
  options: '-c default_transaction_read_only=on -c lock_timeout=1000',
});

const tables = ['bookings', 'booking_users'] as const;

try {
  await client.connect();
  await client.query('BEGIN TRANSACTION READ ONLY');

  const identity = await client.query<{
    database_name: string;
    role_name: string;
    transaction_read_only: string;
  }>(`SELECT current_database() AS database_name,
             current_user AS role_name,
             current_setting('transaction_read_only') AS transaction_read_only`);

  const columns = await client.query<{
    table_name: string;
    ordinal_position: number;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    has_default: boolean;
  }>(`SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable,
             column_default IS NOT NULL AS has_default
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name, ordinal_position`, [tables]);

  const constraints = await client.query<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
    definition: string;
  }>(`SELECT c.relname AS table_name, con.conname AS constraint_name,
             CASE con.contype
               WHEN 'p' THEN 'PRIMARY KEY'
               WHEN 'f' THEN 'FOREIGN KEY'
               WHEN 'u' THEN 'UNIQUE'
               WHEN 'c' THEN 'CHECK'
               WHEN 'x' THEN 'EXCLUSION'
               ELSE con.contype::text
             END AS constraint_type,
             pg_get_constraintdef(con.oid, true) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
       ORDER BY c.relname, constraint_type, con.conname`, [tables]);

  const indexes = await client.query<{
    table_name: string;
    index_name: string;
    is_unique: boolean;
    is_primary: boolean;
    definition: string;
  }>(`SELECT table_name, indexname AS index_name,
             i.indisunique AS is_unique, i.indisprimary AS is_primary,
             indexdef AS definition
        FROM pg_indexes x
        JOIN pg_class idx ON idx.relname = x.indexname
        JOIN pg_index i ON i.indexrelid = idx.oid
       WHERE schemaname = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name, indexname`, [tables]);

  const security = await client.query<{
    table_name: string;
    rls_enabled: boolean;
    rls_forced: boolean;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
  }>(`SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced,
             has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
             has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
             has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
             has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
       ORDER BY c.relname`, [tables]);

  await client.query('ROLLBACK');

  process.stdout.write(`${JSON.stringify({
    connection: {
      database: identity.rows[0]?.database_name,
      role: identity.rows[0]?.role_name,
      transactionReadOnly: identity.rows[0]?.transaction_read_only,
    },
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    security: security.rows,
  }, null, 2)}\n`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
