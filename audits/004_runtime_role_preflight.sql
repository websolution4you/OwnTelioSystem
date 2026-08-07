-- Read-only preflight for the proposed Own Telio runtime role and database API.
-- Reads PostgreSQL metadata only. Does not create roles, schemas or functions.

WITH target_objects AS (
  SELECT jsonb_build_object(
    'current_user', current_user,
    'telio_voice_schema', (
      SELECT jsonb_build_object('exists', true, 'owner', owner.rolname)
        FROM pg_namespace namespace
        JOIN pg_roles owner ON owner.oid = namespace.nspowner
       WHERE namespace.nspname = 'telio_voice'
    ),
    'own_telio_runtime_role', (
      SELECT jsonb_build_object(
        'exists', true,
        'can_login', role.rolcanlogin,
        'superuser', role.rolsuper,
        'create_db', role.rolcreatedb,
        'create_role', role.rolcreaterole,
        'bypass_rls', role.rolbypassrls
      )
        FROM pg_roles role
       WHERE role.rolname = 'own_telio_runtime'
    )
  ) AS details
),
public_executable_functions AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'schema', namespace.nspname,
             'function', procedure.proname,
             'arguments', pg_get_function_identity_arguments(procedure.oid),
             'owner', owner.rolname,
             'security_definer', procedure.prosecdef,
             'language', language.lanname
           ) ORDER BY namespace.nspname, procedure.proname,
                      pg_get_function_identity_arguments(procedure.oid)
         ) AS functions
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
default_function_privileges AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'owner', owner.rolname,
             'schema', namespace.nspname,
             'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
             'privilege', acl.privilege_type,
             'grantable', acl.is_grantable
           ) ORDER BY owner.rolname, namespace.nspname,
                      CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END
         ) AS privileges
    FROM pg_default_acl defaults
    JOIN pg_roles owner ON owner.oid = defaults.defaclrole
    LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
   WHERE defaults.defaclobjtype = 'f'
),
public_table_grants AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'table', format('%I.%I', namespace.nspname, relation.relname),
             'privilege', acl.privilege_type,
             'grantable', acl.is_grantable
           ) ORDER BY namespace.nspname, relation.relname, acl.privilege_type
         ) AS grants
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) acl
   WHERE namespace.nspname = 'public'
     AND relation.relname IN ('bookings', 'booking_users')
     AND relation.relkind IN ('r', 'p', 'v', 'm')
     AND acl.grantee = 0
),
relevant_memberships AS (
  SELECT jsonb_agg(
           jsonb_build_object('member', member.rolname, 'inherits_from', parent.rolname)
           ORDER BY member.rolname, parent.rolname
         ) AS memberships
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
   WHERE member.rolname = 'own_telio_runtime'
      OR parent.rolname = 'own_telio_runtime'
)
SELECT jsonb_pretty(jsonb_build_object(
  'target_objects', (SELECT details FROM target_objects),
  'public_executable_functions', COALESCE(
    (SELECT functions FROM public_executable_functions), '[]'::jsonb
  ),
  'default_function_privileges', COALESCE(
    (SELECT privileges FROM default_function_privileges), '[]'::jsonb
  ),
  'public_grants_on_sensitive_tables', COALESCE(
    (SELECT grants FROM public_table_grants), '[]'::jsonb
  ),
  'runtime_role_memberships', COALESCE(
    (SELECT memberships FROM relevant_memberships), '[]'::jsonb
  )
)) AS runtime_role_preflight;
