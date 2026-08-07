-- Read-only audit of SECURITY DEFINER functions executable by PUBLIC.
-- Reads PostgreSQL metadata only and does not invoke any function.

WITH public_security_definers AS (
  SELECT procedure.oid,
         namespace.nspname AS schema_name,
         procedure.proname AS function_name,
         pg_get_function_identity_arguments(procedure.oid) AS arguments,
         pg_get_function_result(procedure.oid) AS result_type,
         owner.rolname AS owner,
         language.lanname AS language,
         procedure.proconfig AS configuration,
         pg_get_functiondef(procedure.oid) AS definition
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles owner ON owner.oid = procedure.proowner
    JOIN pg_language language ON language.oid = procedure.prolang
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
   WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
     AND namespace.nspname NOT LIKE 'pg_toast%'
     AND procedure.prosecdef
     AND acl.grantee = 0
     AND acl.privilege_type = 'EXECUTE'
),
trigger_usage AS (
  SELECT function.oid AS function_oid,
         jsonb_agg(
           jsonb_build_object(
             'trigger', trigger.tgname,
             'table', format('%I.%I', namespace.nspname, relation.relname),
             'enabled', trigger.tgenabled,
             'definition', pg_get_triggerdef(trigger.oid, true)
           ) ORDER BY namespace.nspname, relation.relname, trigger.tgname
         ) AS triggers
    FROM public_security_definers function
    JOIN pg_trigger trigger ON trigger.tgfoid = function.oid AND NOT trigger.tgisinternal
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
   GROUP BY function.oid
),
dependencies AS (
  SELECT function.oid AS function_oid,
         jsonb_agg(DISTINCT jsonb_build_object(
           'referenced_schema', referenced_namespace.nspname,
           'referenced_object', referenced_relation.relname,
           'object_type', referenced_relation.relkind
         )) AS objects
    FROM public_security_definers function
    JOIN pg_depend dependency ON dependency.objid = function.oid
    JOIN pg_class referenced_relation ON referenced_relation.oid = dependency.refobjid
    JOIN pg_namespace referenced_namespace ON referenced_namespace.oid = referenced_relation.relnamespace
   GROUP BY function.oid
)
SELECT jsonb_pretty(COALESCE(jsonb_agg(
  jsonb_build_object(
    'schema', function.schema_name,
    'function', function.function_name,
    'arguments', function.arguments,
    'result_type', function.result_type,
    'owner', function.owner,
    'language', function.language,
    'configuration', function.configuration,
    'definition', function.definition,
    'triggers', COALESCE(trigger_usage.triggers, '[]'::jsonb),
    'dependencies', COALESCE(dependencies.objects, '[]'::jsonb)
  ) ORDER BY function.schema_name, function.function_name, function.arguments
), '[]'::jsonb)) AS security_definer_audit
FROM public_security_definers function
LEFT JOIN trigger_usage ON trigger_usage.function_oid = function.oid
LEFT JOIN dependencies ON dependencies.function_oid = function.oid;
