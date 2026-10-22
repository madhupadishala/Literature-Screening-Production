-- Read-only diagnostic for the exact scope selected in the 17-Oct screenshot.
WITH scope AS (
  SELECT t.id tenant_id,w.id workspace_id,u.id user_id
  FROM tenants t JOIN nexus_client_workspaces w ON w.tenant_id=t.id
  JOIN application_users u ON lower(u.email)='support@theclinixai.com'
  WHERE t.tenant_key='clinixai-prod' AND w.workspace_key='clinixai-prod-primary'
)
SELECT t.tenant_key,w.workspace_key,u.email,
  t.status tenant_status,w.status workspace_status,u.status user_status,
  tm.membership_status tenant_membership,tm.role_key tenant_role,
  wm.status workspace_membership,
  te.status tenant_submissions_entitlement,te.valid_from tenant_valid_from,te.valid_until tenant_valid_until,
  we.status workspace_submissions_entitlement,we.valid_from workspace_valid_from,we.valid_until workspace_valid_until,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('role',r.role_key,'status',r.status))
    FROM nexus_workspace_module_roles r WHERE r.tenant_id=s.tenant_id AND r.workspace_id=s.workspace_id
    AND r.user_id=s.user_id AND r.environment='PROD' AND r.module_key='SUBMISSIONS'),'[]'::jsonb) submissions_roles
FROM scope s JOIN tenants t ON t.id=s.tenant_id JOIN nexus_client_workspaces w ON w.id=s.workspace_id
JOIN application_users u ON u.id=s.user_id
LEFT JOIN tenant_memberships tm ON tm.tenant_id=s.tenant_id AND tm.user_id=s.user_id
LEFT JOIN nexus_workspace_memberships wm ON wm.tenant_id=s.tenant_id AND wm.workspace_id=s.workspace_id AND wm.user_id=s.user_id
LEFT JOIN tenant_module_entitlements te ON te.tenant_id=s.tenant_id AND te.environment='PROD' AND te.module_key='SUBMISSIONS'
LEFT JOIN nexus_workspace_module_entitlements we ON we.tenant_id=s.tenant_id AND we.workspace_id=s.workspace_id
  AND we.environment='PROD' AND we.module_key='SUBMISSIONS';
