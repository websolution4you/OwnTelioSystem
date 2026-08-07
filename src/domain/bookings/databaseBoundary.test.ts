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
    expect(readApi).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM own_telio_runtime');
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
    expect(verifyReadApi).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(rollbackReadApi).not.toMatch(/\bCASCADE\b/);
    expect(`${readApi}\n${dryRunReadApi}`).not.toMatch(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.bookings/i);
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
