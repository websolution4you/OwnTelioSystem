import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(new URL('./BookingRepository.ts', import.meta.url), 'utf8');
const readApi = readFileSync(
  new URL('../../../proposals/003a_restricted_booking_read_api.sql', import.meta.url),
  'utf8',
);
const createApi = readFileSync(
  new URL('../../../proposals/003b_restricted_booking_create_api.sql', import.meta.url),
  'utf8',
);
const verifyReadApi = readFileSync(
  new URL('../../../proposals/006_verify_restricted_booking_read_api.sql', import.meta.url),
  'utf8',
);
const rollbackReadApi = readFileSync(
  new URL('../../../proposals/007_rollback_restricted_booking_read_api.sql', import.meta.url),
  'utf8',
);
const dryRunReadApi = readFileSync(
  new URL('../../../proposals/008_dry_run_restricted_booking_read_api.sql', import.meta.url),
  'utf8',
);
const disabledAppRole = readFileSync(
  new URL('../../../proposals/011_create_disabled_app_role.sql', import.meta.url),
  'utf8',
);
const verifyDisabledAppRole = readFileSync(
  new URL('../../../proposals/012_verify_disabled_app_role.sql', import.meta.url),
  'utf8',
);
const rollbackDisabledAppRole = readFileSync(
  new URL('../../../proposals/013_rollback_disabled_app_role.sql', import.meta.url),
  'utf8',
);
const dryRunDisabledAppRole = readFileSync(
  new URL('../../../proposals/014_dry_run_disabled_app_role.sql', import.meta.url),
  'utf8',
);
const pool = readFileSync(new URL('../../db/pool.ts', import.meta.url), 'utf8');

describe('least-privilege booking database boundary', () => {
  it('allows the repository to call only the restricted booking API', () => {
    expect(repository).toContain('telio_voice.occupied_courts');
    expect(repository).toContain('telio_voice.create_booking');
    expect(repository).not.toContain('find_upcoming_bookings');
    expect(repository).not.toMatch(/\b(?:FROM|INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?bookings\b/i);
    expect(repository).not.toContain('booking_users');
    expect(repository).not.toContain('user_id');
    expect(repository).not.toContain('notes');
  });

  it('locks down security-definer functions and the runtime role', () => {
    const sql = `${readApi}\n${createApi}`;
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(sql.match(/SET search_path = pg_catalog/g)).toHaveLength(2);
    expect(sql.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC;/g)).toHaveLength(2);
    expect(readApi).toContain('CREATE ROLE own_telio_runtime NOLOGIN');
    expect(readApi).toContain('REVOKE CREATE ON SCHEMA public FROM own_telio_runtime');
    expect(readApi).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM own_telio_runtime');
    expect(readApi).toContain('CREATE FUNCTION telio_voice.occupied_courts');
    expect(readApi).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[^\s(]*(?:find|list|cancel|delete|update|restore)/i);
    const returnSignatures = sql.match(/RETURNS TABLE\([\s\S]*?\)/g) ?? [];
    expect(returnSignatures).toHaveLength(2);
    expect(returnSignatures.join('\n')).not.toMatch(/\b(?:user_id|notes)\b/);
  });

  it('fails closed and provides a non-persistent read-only deployment rehearsal', () => {
    expect(readApi).toContain("current_user <> 'postgres'");
    expect(readApi).toContain('telio_voice schema already exists');
    expect(readApi).toContain('own_telio_runtime role already exists');
    expect(dryRunReadApi).toContain('ROLLBACK;');
    expect(dryRunReadApi).not.toContain('COMMIT;');
    expect(dryRunReadApi).toContain('schema_still_exists');
    expect(dryRunReadApi).toContain('role_still_exists');
    for (const transactionalTest of [dryRunReadApi, verifyReadApi]) {
      expect(transactionalTest).toContain('GRANT own_telio_runtime TO postgres;');
      expect(transactionalTest).toContain('RESET ROLE;');
      expect(transactionalTest).toContain('REVOKE own_telio_runtime FROM postgres;');
      expect(transactionalTest).toContain('ROLLBACK;');
      expect(transactionalTest).not.toContain('COMMIT;');
    }
    expect(rollbackReadApi).not.toMatch(/\bCASCADE\b/);
    expect(`${readApi}\n${dryRunReadApi}\n${verifyReadApi}`).not.toMatch(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.bookings/i);
  });

  it('creates the application identity disabled, read-only and resource constrained', () => {
    expect(disabledAppRole).toContain('CREATE ROLE own_telio_app');
    expect(disabledAppRole).toContain('NOLOGIN');
    expect(disabledAppRole).toContain('CONNECTION LIMIT 4');
    expect(disabledAppRole).toContain('GRANT own_telio_runtime TO own_telio_app');
    expect(disabledAppRole).toContain('default_transaction_read_only = on');
    expect(disabledAppRole).not.toMatch(/\bPASSWORD\b/i);
    expect(verifyDisabledAppRole).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|CALL|PERFORM)\b/im);
    expect(dryRunDisabledAppRole).toContain('ROLLBACK;');
    expect(dryRunDisabledAppRole).not.toContain('COMMIT;');
    expect(dryRunDisabledAppRole).toContain('app_role_still_exists');
    expect(rollbackDisabledAppRole).not.toMatch(/\bCASCADE\b/);
    expect(pool).toContain('max: 3');
    expect(pool).toContain('query_timeout: 10_000');
    expect(pool).toContain('statement_timeout: 8_000');
  });

  it('pins the production tenant and exact court inventory', () => {
    const tenantId = '595cbb6c-1019-41ae-b1c2-a60c13c8dcdf';
    expect(readApi).toContain(tenantId);
    expect(createApi).toContain(tenantId);
    const badmintonCourts = createApi.match(/'badminton-\d+'/g) ?? [];
    expect(badmintonCourts).toHaveLength(10);
    expect(badmintonCourts).toContain("'badminton-10'");
    expect(createApi).not.toContain("'badminton-11'");
  });
});
