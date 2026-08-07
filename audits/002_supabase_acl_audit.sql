-- Read-only privilege audit for the shared production Supabase database.
-- This query reads PostgreSQL metadata only. It does not read booking rows or change the database.

WITH target_tables(table_schema, table_name) AS (
  VALUES ('public'::text, 'bookings'::text), ('public'::text, 'booking_users'::text)
),
table_grants AS (
  SELECT tp.table_schema, tp.table_name,
         jsonb_agg(
           jsonb_build_object(
             'grantee', tp.grantee,
             'privilege', tp.privilege_type,
             'grantable', tp.is_grantable
           ) ORDER BY tp.grantee, tp.privilege_type
         ) AS grants
    FROM information_schema.table_privileges tp
    JOIN target_tables tt USING (table_schema, table_name)
   GROUP BY tp.table_schema, tp.table_name
),
column_grants AS (
  SELECT cp.table_schema, cp.table_name,
         jsonb_agg(
           jsonb_build_object(
             'column', cp.column_name,
             'grantee', cp.grantee,
             'privilege', cp.privilege_type,
             'grantable', cp.is_grantable
           ) ORDER BY cp.column_name, cp.grantee, cp.privilege_type
         ) AS grants
    FROM information_schema.column_privileges cp
    JOIN target_tables tt USING (table_schema, table_name)
   GROUP BY cp.table_schema, cp.table_name
),
policies AS (
  SELECT schemaname AS table_schema, tablename AS table_name,
         jsonb_agg(
           jsonb_build_object(
             'name', policyname,
             'roles', roles,
             'command', cmd,
             'permissive', permissive
           ) ORDER BY policyname
         ) AS policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('bookings', 'booking_users')
   GROUP BY schemaname, tablename
),
role_memberships AS (
  SELECT jsonb_agg(
           jsonb_build_object('member', member.rolname, 'inherits_from', parent.rolname)
           ORDER BY member.rolname, parent.rolname
         ) AS memberships
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
   WHERE member.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
      OR parent.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
),
schema_access AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'role', role_name,
             'public_schema_usage', has_schema_privilege(role_name, 'public', 'USAGE'),
             'public_schema_create', has_schema_privilege(role_name, 'public', 'CREATE')
           ) ORDER BY role_name
         ) AS access
    FROM (
      SELECT rolname AS role_name
        FROM pg_roles
       WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
      UNION ALL SELECT 'PUBLIC'
    ) roles
)
SELECT jsonb_pretty(jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(
      jsonb_build_object(
        'table', format('%I.%I', tt.table_schema, tt.table_name),
        'table_grants', COALESCE(tg.grants, '[]'::jsonb),
        'column_grants', COALESCE(cg.grants, '[]'::jsonb),
        'policies', COALESCE(p.policies, '[]'::jsonb)
      ) ORDER BY tt.table_name
    )
    FROM target_tables tt
    LEFT JOIN table_grants tg USING (table_schema, table_name)
    LEFT JOIN column_grants cg USING (table_schema, table_name)
    LEFT JOIN policies p USING (table_schema, table_name)
  ),
  'role_memberships', COALESCE((SELECT memberships FROM role_memberships), '[]'::jsonb),
  'schema_access', COALESCE((SELECT access FROM schema_access), '[]'::jsonb)
)) AS acl_audit;
