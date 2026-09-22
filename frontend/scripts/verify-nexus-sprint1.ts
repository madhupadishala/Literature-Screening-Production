import assert from "node:assert/strict";

import {
  NEXUS_MODULES,
  getModuleDependencies,
  isNexusModuleKey,
} from "../lib/nexus/modules";
import { entitlementIsActive } from "../lib/nexus/entitlement-types";
import { evaluateNexusAuthorization } from "../lib/nexus/authorization-policy";
import { PERMISSIONS, roleHasPermission } from "../lib/rbac/permissions";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  platformRoleHasPermission,
} from "../lib/nexus/platform-permissions";

assert.equal(isNexusModuleKey("LITERATURE"), true);
assert.equal(isNexusModuleKey("NOT_A_MODULE"), false);
assert.deepEqual(getModuleDependencies(NEXUS_MODULES.CASE_PROCESSING), ["INTAKE"]);

assert.equal(
  entitlementIsActive({
    status: "enabled",
    validFrom: null,
    validUntil: null,
  }),
  true,
);

assert.equal(
  entitlementIsActive({
    status: "disabled",
    validFrom: null,
    validUntil: null,
  }),
  false,
);

assert.deepEqual(
  evaluateNexusAuthorization({
    tenantActive: true,
    environmentAllowed: true,
    moduleKey: NEXUS_MODULES.INTAKE,
    moduleEnabled: true,
    dependenciesEnabled: true,
    permissionAllowed: true,
  }),
  { allowed: true },
);

assert.deepEqual(
  evaluateNexusAuthorization({
    tenantActive: true,
    environmentAllowed: true,
    moduleKey: NEXUS_MODULES.INTAKE,
    moduleEnabled: false,
    dependenciesEnabled: true,
    permissionAllowed: true,
  }),
  { allowed: false, reason: "MODULE_NOT_ENTITLED" },
);

assert.deepEqual(
  evaluateNexusAuthorization({
    tenantActive: true,
    environmentAllowed: true,
    moduleKey: NEXUS_MODULES.CASE_PROCESSING,
    moduleEnabled: true,
    dependenciesEnabled: false,
    permissionAllowed: true,
  }),
  { allowed: false, reason: "MODULE_DEPENDENCY_NOT_ENTITLED" },
);

assert.equal(
  platformRoleHasPermission(
    PLATFORM_ROLES.SUPER_ADMIN,
    PLATFORM_PERMISSIONS.ENTITLEMENT_MANAGE,
  ),
  true,
);
assert.equal(
  platformRoleHasPermission(
    PLATFORM_ROLES.AUDITOR,
    PLATFORM_PERMISSIONS.ENTITLEMENT_MANAGE,
  ),
  false,
);
assert.equal(roleHasPermission("PV_ADMINISTRATOR", PERMISSIONS.INTAKE_PROCESS), true);
assert.equal(roleHasPermission("QC_REVIEWER", PERMISSIONS.CASE_QC), true);
assert.equal(roleHasPermission("LITERATURE_REVIEWER", PERMISSIONS.CASE_PROCESS), false);

console.log("Nexus Sprint 1 verification passed.");
