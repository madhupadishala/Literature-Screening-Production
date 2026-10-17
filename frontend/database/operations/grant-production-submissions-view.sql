-- Execute with psql -X -v ON_ERROR_STOP=1 -f <this file> using the configured production DB.
-- Only fills missing access records for the confirmed existing administrator/workspace.
-- Grants MODULE_VIEWER; does not grant create/transmit or enable live transport.
-- Existing disabled/suspended/expired entitlements are preserved and cause rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $grant$
DECLARE
  target_tenant constant uuid := 'c3570ce0-6492-4dac-ba40-c0363b2835a4';
  target_workspace constant uuid := '8c2b32e2-6816-4265-9e71-48411d5207c4';
  target_user constant uuid := '01e00a97-ff7f-4908-b84d-563766d9bff7';
  grant_reason constant text := 'Restore missing Submissions visibility for existing production administrator; read-only module role.';
  n_tenant integer;
  n_workspace integer;
  n_role integer;
BEGIN
  IF current_database() <> 'literature_screening_prod' OR
     current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-muddy-tooth-b3186ol1' THEN
    RAISE EXCEPTION 'Refusing to modify an unverified database/branch';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_tenant::text || ':PROD:SUBMISSIONS',0));
  IF NOT EXISTS (
    SELECT 1 FROM tenants t
    JOIN nexus_client_workspaces w ON w.tenant_id=t.id
    JOIN application_users u ON u.id=target_user
    JOIN tenant_memberships tm ON tm.tenant_id=t.id AND tm.user_id=u.id
    JOIN nexus_workspace_memberships wm ON wm.tenant_id=t.id AND wm.workspace_id=w.id AND wm.user_id=u.id
    JOIN platform_role_assignments p ON p.user_id=u.id
    WHERE t.id=target_tenant AND t.tenant_key='clinixai-prod' AND t.status='active'
      AND w.id=target_workspace AND w.workspace_key='clinixai-prod-primary' AND w.status='active'
      AND lower(u.email)='support@theclinixai.com' AND u.status='active'
      AND tm.membership_status='active' AND tm.role_key='CLINIXAI_SUPER_ADMIN'
      AND wm.status='active' AND p.status='active' AND p.role_key='PLATFORM_SUPER_ADMIN'
  ) THEN RAISE EXCEPTION 'Expected active administrator memberships not found'; END IF;

  INSERT INTO tenant_module_entitlements(tenant_id,environment,module_key,status,updated_by)
    VALUES(target_tenant,'PROD','SUBMISSIONS','enabled',target_user)
    ON CONFLICT(tenant_id,environment,module_key) DO NOTHING;
  GET DIAGNOSTICS n_tenant = ROW_COUNT;
  IF n_tenant=1 THEN
    INSERT INTO tenant_module_entitlement_history
      (tenant_id,environment,module_key,version,status,capabilities,limits,valid_from,valid_until,changed_by,change_reason)
      SELECT tenant_id,environment,module_key,version,status,capabilities,limits,valid_from,valid_until,target_user,grant_reason
      FROM tenant_module_entitlements WHERE tenant_id=target_tenant AND environment='PROD' AND module_key='SUBMISSIONS';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM tenant_module_entitlements WHERE tenant_id=target_tenant AND environment='PROD'
    AND module_key='SUBMISSIONS' AND status='enabled' AND (valid_from IS NULL OR valid_from<=now())
    AND (valid_until IS NULL OR valid_until>now())) THEN
    RAISE EXCEPTION 'Existing tenant entitlement is not active; refusing to override it';
  END IF;

  INSERT INTO nexus_workspace_module_entitlements(tenant_id,workspace_id,environment,module_key,status,updated_by)
    VALUES(target_tenant,target_workspace,'PROD','SUBMISSIONS','enabled',target_user)
    ON CONFLICT(workspace_id,environment,module_key) DO NOTHING;
  GET DIAGNOSTICS n_workspace = ROW_COUNT;
  IF n_workspace=1 THEN
    INSERT INTO nexus_workspace_access_history
      (tenant_id,workspace_id,target_user_id,environment,module_key,change_type,new_state,changed_by,change_reason)
      VALUES(target_tenant,target_workspace,target_user,'PROD','SUBMISSIONS','WORKSPACE_MODULE_ENTITLEMENT_CHANGED',
        jsonb_build_object('status','enabled','version',1),target_user,grant_reason);
  END IF;

  IF NOT EXISTS(SELECT 1 FROM nexus_workspace_module_entitlements WHERE tenant_id=target_tenant
    AND workspace_id=target_workspace AND environment='PROD' AND module_key='SUBMISSIONS'
    AND status='enabled' AND (valid_from IS NULL OR valid_from<=now()) AND (valid_until IS NULL OR valid_until>now())) THEN
    RAISE EXCEPTION 'Existing workspace entitlement is not active; refusing to override it';
  END IF;

  INSERT INTO nexus_workspace_module_roles(tenant_id,workspace_id,user_id,environment,module_key,role_key,status,updated_by)
    VALUES(target_tenant,target_workspace,target_user,'PROD','SUBMISSIONS','MODULE_VIEWER','active',target_user)
    ON CONFLICT(workspace_id,user_id,environment,module_key,role_key) DO NOTHING;
  GET DIAGNOSTICS n_role = ROW_COUNT;
  IF n_role=1 THEN
    INSERT INTO nexus_workspace_access_history
      (tenant_id,workspace_id,target_user_id,environment,module_key,change_type,new_state,changed_by,change_reason)
      VALUES(target_tenant,target_workspace,target_user,'PROD','SUBMISSIONS','WORKSPACE_MODULE_ROLE_CHANGED',
        jsonb_build_object('roleKey','MODULE_VIEWER','status','active'),target_user,grant_reason);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM nexus_workspace_module_roles WHERE tenant_id=target_tenant
    AND workspace_id=target_workspace AND user_id=target_user AND environment='PROD'
    AND module_key='SUBMISSIONS' AND role_key='MODULE_VIEWER' AND status='active') THEN
    RAISE EXCEPTION 'Existing viewer assignment is disabled; refusing to override it';
  END IF;
  RAISE NOTICE 'Missing access records inserted: tenant=%, workspace=%, viewer=%',n_tenant,n_workspace,n_role;
END;
$grant$;
COMMIT;
