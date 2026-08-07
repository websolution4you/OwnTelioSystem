-- Read-only audit of effective privileges for the deployed NOLOGIN permission role.
-- Reads PostgreSQL metadata only. It does not invoke routines or read application rows.

WITH role_details AS (
  SELECT jsonb_build_object(
           'role', role.rolname,
           'can_login', role.rolcanlogin,
           'superuser', role.rolsuper,
           'inherit', role.rolinherit,
           'create_db', role.rolcreatedb,
           'create_role', role.rolcreaterole,
           'replication', role.rolreplication,
           'bypass_rls', role.rolbypassrls,
           'connection_limit', role.rolconnlimit
         ) AS details
    FROM pg_roles role
   WHERE role.rolname = 'own_telio_runtime'
),
memberships AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'member', member.rolname,
             'inherits_from', parent.rolname,
             'admin_option', membership.admin_option
           ) ORDER BY member.rolname, parent.rolname
         ) AS memberships
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
   WHERE member.rolname = 'own_telio_runtime'
      OR parent.rolname = 'own_telio_runtime'
),
database_privileges AS (
  SELECT jsonb_build_object(
           'connect', has_database_privilege('own_telio_runtime', current_database(), 'CONNECT'),
           'create', has_database_privilege('own_telio_runtime', current_database(), 'CREATE'),
           'temporary', has_database_privilege('own_telio_runtime', current_database(), 'TEMPORARY')
         ) AS privileges
),
schema_privileges AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'schema', namespace.nspname,
             'owner', owner.rolname,
             'usage', has_schema_privilege('own_telio_runtime', namespace.oid, 'USAGE'),
             'create', has_schema_privilege('own_telio_runtime', namespace.oid, 'CREATE')
           ) ORDER BY namespace.nspname
         ) AS privileges
    FROM pg_namespace namespace
    JOIN pg_roles owner ON owner.oid = namespace.nspowner
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND namespace.nspname NOT LIKE 'pg_temp_%'
),
relation_privileges AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'relation', format('%I.%I', namespace.nspname, relation.relname),
             'kind', relation.relkind,
             'schema_usage', has_schema_privilege('own_telio_runtime', namespace.oid, 'USAGE'),
             'select', has_table_privilege('own_telio_runtime', relation.oid, 'SELECT'),
             'insert', has_table_privilege('own_telio_runtime', relation.oid, 'INSERT'),
             'update', has_table_privilege('own_telio_runtime', relation.oid, 'UPDATE'),
             'delete', has_table_privilege('own_telio_runtime', relation.oid, 'DELETE'),
             'truncate', has_table_privilege('own_telio_runtime', relation.oid, 'TRUNCATE'),
             'references', has_table_privilege('own_telio_runtime', relation.oid, 'REFERENCES'),
             'trigger', has_table_privilege('own_telio_runtime', relation.oid, 'TRIGGER')
           ) ORDER BY namespace.nspname, relation.relname
         ) FILTER (WHERE
           has_table_privilege('own_telio_runtime', relation.oid, 'SELECT') OR
           has_table_privilege('own_telio_runtime', relation.oid, 'INSERT') OR
           has_table_privilege('own_telio_runtime', relation.oid, 'UPDATE') OR
           has_table_privilege('own_telio_runtime', relation.oid, 'DELETE') OR
           has_table_privilege('own_telio_runtime', relation.oid, 'TRUNCATE') OR
           has_table_privilege('own_telio_runtime', relation.oid, 'REFERENCES') OR
           has_table_privilege('own_telio_runtime', relation.oid, 'TRIGGER')
         ) AS privileges
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND namespace.nspname NOT LIKE 'pg_temp_%'
     AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
),
sequence_privileges AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'sequence', format('%I.%I', namespace.nspname, relation.relname),
             'schema_usage', has_schema_privilege('own_telio_runtime', namespace.oid, 'USAGE'),
             'usage', has_sequence_privilege('own_telio_runtime', relation.oid, 'USAGE'),
             'select', has_sequence_privilege('own_telio_runtime', relation.oid, 'SELECT'),
             'update', has_sequence_privilege('own_telio_runtime', relation.oid, 'UPDATE')
           ) ORDER BY namespace.nspname, relation.relname
         ) FILTER (WHERE
           has_sequence_privilege('own_telio_runtime', relation.oid, 'USAGE') OR
           has_sequence_privilege('own_telio_runtime', relation.oid, 'SELECT') OR
           has_sequence_privilege('own_telio_runtime', relation.oid, 'UPDATE')
         ) AS privileges
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND namespace.nspname NOT LIKE 'pg_temp_%'
     AND relation.relkind = 'S'
),
routine_privileges AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'routine', format('%I.%I(%s)', namespace.nspname, procedure.proname,
                               pg_get_function_identity_arguments(procedure.oid)),
             'result_type', pg_get_function_result(procedure.oid),
             'owner', owner.rolname,
             'security_definer', procedure.prosecdef,
             'schema_usage', has_schema_privilege('own_telio_runtime', namespace.oid, 'USAGE'),
             'execute', has_function_privilege('own_telio_runtime', procedure.oid, 'EXECUTE'),
             'effectively_callable',
               has_schema_privilege('own_telio_runtime', namespace.oid, 'USAGE') AND
               has_function_privilege('own_telio_runtime', procedure.oid, 'EXECUTE')
           ) ORDER BY namespace.nspname, procedure.proname,
                      pg_get_function_identity_arguments(procedure.oid)
         ) FILTER (WHERE has_function_privilege('own_telio_runtime', procedure.oid, 'EXECUTE')) AS privileges
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles owner ON owner.oid = procedure.proowner
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND namespace.nspname NOT LIKE 'pg_temp_%'
),
sensitive_assertions AS (
  SELECT jsonb_build_object(
           'bookings_select', has_table_privilege('own_telio_runtime', 'public.bookings', 'SELECT'),
           'bookings_insert', has_table_privilege('own_telio_runtime', 'public.bookings', 'INSERT'),
           'bookings_update', has_table_privilege('own_telio_runtime', 'public.bookings', 'UPDATE'),
           'bookings_delete', has_table_privilege('own_telio_runtime', 'public.bookings', 'DELETE'),
           'booking_users_select', has_table_privilege('own_telio_runtime', 'public.booking_users', 'SELECT'),
           'occupied_courts_execute', has_function_privilege(
             'own_telio_runtime',
             'telio_voice.occupied_courts(uuid,timestamptz,timestamptz)',
             'EXECUTE'
           )
         ) AS assertions
)
SELECT jsonb_pretty(jsonb_build_object(
  'role', COALESCE((SELECT details FROM role_details), '{}'::jsonb),
  'memberships', COALESCE((SELECT memberships FROM memberships), '[]'::jsonb),
  'database_privileges', (SELECT privileges FROM database_privileges),
  'schema_privileges', COALESCE((SELECT privileges FROM schema_privileges), '[]'::jsonb),
  'relation_privileges', COALESCE((SELECT privileges FROM relation_privileges), '[]'::jsonb),
  'sequence_privileges', COALESCE((SELECT privileges FROM sequence_privileges), '[]'::jsonb),
  'routine_privileges', COALESCE((SELECT privileges FROM routine_privileges), '[]'::jsonb),
  'sensitive_assertions', (SELECT assertions FROM sensitive_assertions)
)) AS effective_runtime_role;
