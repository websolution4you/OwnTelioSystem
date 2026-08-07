-- Read-only audit of privileges inherited by every future login through PostgreSQL PUBLIC.
-- Reads metadata only. It does not read application rows or change database objects.

WITH public_schemas AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'schema', namespace.nspname,
             'owner', owner.rolname,
             'privilege', acl.privilege_type,
             'grantable', acl.is_grantable
           ) ORDER BY namespace.nspname, acl.privilege_type
         ) AS grants
    FROM pg_namespace namespace
    JOIN pg_roles owner ON owner.oid = namespace.nspowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) acl
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND acl.grantee = 0
),
public_relations AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'relation', format('%I.%I', namespace.nspname, relation.relname),
             'kind', relation.relkind,
             'owner', owner.rolname,
             'privilege', acl.privilege_type,
             'grantable', acl.is_grantable
           ) ORDER BY namespace.nspname, relation.relname, acl.privilege_type
         ) AS grants
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(
        relation.relacl,
        acldefault(CASE WHEN relation.relkind = 'S' THEN 'S'::char ELSE 'r'::char END, relation.relowner)
      )
    ) acl
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
     AND acl.grantee = 0
),
public_routines AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'routine', format('%I.%I(%s)', namespace.nspname, procedure.proname,
                               pg_get_function_identity_arguments(procedure.oid)),
             'owner', owner.rolname,
             'security_definer', procedure.prosecdef,
             'language', language.lanname,
             'privilege', acl.privilege_type,
             'grantable', acl.is_grantable
           ) ORDER BY namespace.nspname, procedure.proname,
                      pg_get_function_identity_arguments(procedure.oid)
         ) AS grants
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles owner ON owner.oid = procedure.proowner
    JOIN pg_language language ON language.oid = procedure.prolang
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND acl.grantee = 0
     AND acl.privilege_type = 'EXECUTE'
),
public_types AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'type', format('%I.%I', namespace.nspname, type.typname),
             'owner', owner.rolname,
             'privilege', acl.privilege_type,
             'grantable', acl.is_grantable
           ) ORDER BY namespace.nspname, type.typname, acl.privilege_type
         ) AS grants
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_roles owner ON owner.oid = type.typowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(type.typacl, acldefault('T', type.typowner))
    ) acl
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND acl.grantee = 0
),
database_access AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'database', database.datname,
             'owner', owner.rolname,
             'privilege', acl.privilege_type,
             'grantable', acl.is_grantable
           ) ORDER BY database.datname, acl.privilege_type
         ) AS grants
    FROM pg_database database
    JOIN pg_roles owner ON owner.oid = database.datdba
    CROSS JOIN LATERAL aclexplode(
      COALESCE(database.datacl, acldefault('d', database.datdba))
    ) acl
   WHERE database.datname = current_database()
     AND acl.grantee = 0
)
SELECT jsonb_pretty(jsonb_build_object(
  'database', current_database(),
  'public_database_grants', COALESCE((SELECT grants FROM database_access), '[]'::jsonb),
  'public_schema_grants', COALESCE((SELECT grants FROM public_schemas), '[]'::jsonb),
  'public_relation_grants', COALESCE((SELECT grants FROM public_relations), '[]'::jsonb),
  'public_routine_grants', COALESCE((SELECT grants FROM public_routines), '[]'::jsonb),
  'public_type_grants', COALESCE((SELECT grants FROM public_types), '[]'::jsonb)
)) AS public_runtime_surface;
