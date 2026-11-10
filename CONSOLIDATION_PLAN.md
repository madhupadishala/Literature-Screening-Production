# CONSOLIDATION PLAN: Literature-Screening-Production

**Generated:** 2026-11-06  
**Based on:** Third-party audit findings  
**Goal:** Eliminate duplicate implementations, unify authority, enable production readiness  
**Estimated Total Effort:** 6-8 weeks (vs 6-12 months rewrite)

---

## 📋 PRIORITY MATRIX

| Priority | Area | Impact | Effort | Risk |
|----------|------|--------|--------|------|
| **P0** | Agentic_AI Branch Consolidation | 🔴 Critical — 60% code reduction | 2-3 weeks | Medium |
| **P1** | RBAC Unification | 🔴 Critical — Single authority | 1-2 weeks | Low |
| **P2** | Duplicate Service Consolidation | 🟡 High — Clear ownership | 2-3 weeks | Medium |
| **P3** | Design System Extraction | 🟡 Medium — UI consistency | 1-2 weeks | Low |

---

## 🎯 P0: AGENTIC_AI BRANCH CONSOLIDATION

### **Problem**
27 agents, each with 1-3 branches in `src/branches/` — same agent implemented multiple times with different ideologies. `live_integration: "not_verified"` for 21/27 agents.

### **Current State (Sample)**
```
AG02_Adverse_Event_MedDRA/
  src/branches/feat__event-extraction-agent/      ← 14 files
AG05_Indication_Identification/
  src/branches/integration__nexus-agent-five-steps-20261011/
AG08_Country_of_Incident/
  src/branches/consolidate__nexus-shared-agents/
AG10_Translation/
  src/branches/consolidate__nexus-shared-agents/
AG12_Listedness_Expectedness/
  src/branches/consolidate__nexus-shared-agents/
AG17_Safety_Information_Detection/
  src/branches/feat__pv-safety-assessment-engine-v1/
  src/branches/feat__safety-assessment-consolidation-20261008/  ← TWO branches!
AG20_Narrative_Generation/
  src/branches/consolidate__nexus-shared-agents/
```

### **Decision Framework: Which Branch to Keep?**

| Agent | Branches | **RECOMMENDED KEEP** | Rationale |
|-------|----------|---------------------|-----------|
| AG01 | (none — flat) | `src/backend/` | Already canonical |
| AG02 | `feat__event-extraction-agent` | **Keep** — most complete, native runtime | 14 files, `native_runtime: python-event-engine` |
| AG03 | `v2_5` | **Keep** — versioned, has binding | `binding: v25_bindings` |
| AG04 | `v2_5` | **Keep** — versioned, has binding | `binding: v25_bindings` |
| AG05 | `integration__nexus-agent-five-steps-20261011` | **Keep** — latest integration attempt | Named for Nexus integration |
| AG06 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG07 | (none) | **MISSING** — flag in registry | `source_missing` |
| AG08 | `consolidate__nexus-shared-agents` | **Keep** — consolidate branch | Frontend TS agent, native runtime |
| AG09 | `v2_5` | **Keep** — versioned | `binding: v25_bindings` |
| AG10 | `consolidate__nexus-shared-agents` | **Keep** — consolidate branch | Frontend TS, shared agents pattern |
| AG11 | (flat) | **Keep** — `src/backend/` | Native pipeline, verified deps |
| AG12 | `consolidate__nexus-shared-agents` | **Keep** — consolidate branch | TypeScript listedness, native runtime |
| AG13 | (flat) | **Keep** — `src/backend/` | Native pipeline, comprehensive |
| AG14 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG15 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG16 | (none) | **MISSING** — flag in registry | `source_missing` |
| AG17 | **TWO BRANCHES** | **Keep `feat__safety-assessment-consolidation-20261008`** | Newer, "consolidation" in name, governed orchestrator |
| AG18 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG19 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG20 | `consolidate__nexus-shared-agents` | **Keep** — consolidate branch | TypeScript narrative, native runtime |
| AG21 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG22 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG23 | `kimi8` | **Keep** — only branch | `kimi8` pattern |
| AG24 | `v2_5` (current + history) | **Keep** — versioned | Two engines: `HistoricalAgent` + `CurrentAgent` |
| AG25 | (none) | **MISSING** — flag in registry | `source_missing` |
| AG26 | `consolidate__nexus-shared-agents` | **Keep** — consolidate branch | TypeScript triage, native runtime |
| AG27 | (none) | **MISSING** — flag in registry | `source_missing` |

### **Action Plan: Week 1-2**

#### **Step 1: Inventory & Decision Log (Day 1)**
```bash
# Create decision log
cat > AGENT_CONSOLIDATION_LOG.md << 'EOF'
# Agentic_AI Consolidation Decision Log
Date: 2026-11-06
Decider: [Name]
EOF
```

#### **Step 2: For Each Agent with Branches (Days 2-5)**
```bash
# Template per agent:
cd Agentic_AI/AGXX_*/

# 1. Compare branches
diff -r src/branches/branchA/ src/branches/branchB/ > diff.patch

# 2. Run tests (if any)
python -m pytest src/branches/branchA/tests/ 2>/dev/null || echo "No tests"

# 3. Check integration_registry.json binding
#    - Which binding does it use?
#    - Is the binding implemented in shared/execution/?

# 4. Decision: KEEP branch X, DELETE branch Y,Z
#    Document rationale in log

# 5. Move kept branch to src/canonical/
mv src/branches/kept-branch src/canonical

# 6. Update integration_registry.json
#    - implementation: "Agentic_AI/AGXX/src/canonical"
#    - live_integration: update after verification
```

#### **Step 3: Handle Special Cases (Days 6-8)**
| Agent | Special Handling |
|-------|------------------|
| AG17 | Two branches → keep `feat__safety-assessment-consolidation-20261008` (newer, governed orchestrator). Merge any unique code from v1 branch. |
| AG24 | Two engines (`current` + `history`) → keep both under `src/canonical/v2_5/{current,history}/` |
| AG07, AG16, AG25, AG27 | `source_missing` → **Create stub** with TODO, or mark as `deferred` in registry |

#### **Step 4: Cleanup & Verify (Days 9-10)**
```bash
# Remove all src/branches/ directories
find Agentic_AI -type d -name "branches" -exec rm -rf {} +

# Verify each agent has src/canonical/
for dir in Agentic_AI/AG*/; do
  if [ ! -d "${dir}src/canonical" ]; then
    echo "MISSING: $dir"
  fi
done

# Update integration_registry.json with canonical paths
# Run integration tests (see P1)
```

### **Files to Modify**
- `Agentic_AI/integration_registry.json` — update `implementation` paths
- `Agentic_AI/shared/agent_context_registry.json` — update `implementation` paths
- **Delete:** All `Agentic_AI/AG*/src/branches/` directories (~150+ files)

### **Success Criteria**
- [ ] 27 agents each have exactly ONE `src/canonical/` implementation
- [ ] `integration_registry.json` points to canonical paths
- [ ] All `live_integration` statuses updated (target: "verified" for core agents)
- [ ] Zero `src/branches/` directories remain
- [ ] Git history shows clean deletion commits

---

## 🎯 P1: RBAC UNIFICATION

### **Problem**
Two parallel RBAC systems with no shared permission enum:
1. **Tenant RBAC** (`lib/rbac/permissions.ts`) — 81 permissions, 14 role keys
2. **Platform RBAC** (`lib/nexus/platform-rbac.ts`) — Separate permissions, separate roles

### **Current Architecture**
```
Tenant RBAC                          Platform RBAC
─────────────────────────            ─────────────────────
PERMISSIONS (81)                     PlatformPermission (unknown count)
ROLE_PERMISSIONS (14 roles)          PlatformRole (unknown)
roleHasPermission()                  platformRoleHasPermission()
Used in: lib/rbac/guard.ts           Used in: lib/rbac/guard.ts (requirePlatformPermission)
```

### **Unification Strategy: Platform RBAC Composes Tenant RBAC**

#### **New Model**
```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED PERMISSION ENUM                  │
├─────────────────────────────────────────────────────────────┤
│  literature.search.execute    ← Tenant                      │
│  literature.screening.execute ← Tenant                      │
│  platform.tenant.manage       ← Platform                    │
│  platform.release.manage      ← Platform                    │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │   TENANT ROLES      │         │   PLATFORM ROLES    │
    │  (CLIENT_ADMIN,     │         │  (PLATFORM_ADMIN,   │
    │   SUPER_USER, etc)  │         │   PLATFORM_OPS)     │
    └─────────────────────┘         └─────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
              ┌─────────────────────────────┐
              │   REQUEST PRINCIPAL         │
              │   hasPermission(perm)       │
              │   • checks tenant role      │
              │   • checks platform role    │
              │   • checks custom perms     │
              └─────────────────────────────┘
```

### **Action Plan: Week 3-4**

#### **Step 1: Create Unified Permission Enum (Day 1)**
```typescript
// NEW FILE: lib/rbac/unified-permissions.ts
export const UNIFIED_PERMISSIONS = {
  // --- TENANT PERMISSIONS (existing) ---
  ...PERMISSIONS,  // spread existing 81

  // --- PLATFORM PERMISSIONS (migrate from platform-rbac.ts) ---
  PLATFORM_TENANT_MANAGE: "platform.tenant.manage",
  PLATFORM_TENANT_VIEW: "platform.tenant.view",
  PLATFORM_RELEASE_MANAGE: "platform.release.manage",
  PLATFORM_RELEASE_VIEW: "platform.release.view",
  PLATFORM_ENTITLEMENT_MANAGE: "platform.entitlement.manage",
  PLATFORM_ENTITLEMENT_VIEW: "platform.entitlement.view",
  PLATFORM_SUPER_USER_MANAGE: "platform.super_user.manage",
  PLATFORM_ADMIN_SETTINGS_MANAGE: "platform.admin.settings.manage",
  PLATFORM_RELIABILITY_VIEW: "platform.reliability.view",
  PLATFORM_PERFORMANCE_VIEW: "platform.performance.view",
  PLATFORM_DATA_EXPORT: "platform.data.export",
  PLATFORM_DATA_IMPORT: "platform.data.import",
  PLATFORM_STORAGE_UPLOAD: "platform.storage.upload",
  PLATFORM_TENANT_CONFIG_MANAGE: "platform.tenant.config.manage",
  PLATFORM_VERSIONING_MANAGE: "platform.versioning.manage",
} as const;

export type UnifiedPermission = (typeof UNIFIED_PERMISSIONS)[keyof typeof UNIFIED_PERMISSIONS];
```

#### **Step 2: Unified Role Definitions (Day 2)**
```typescript
// NEW FILE: lib/rbac/unified-roles.ts
import { UNIFIED_PERMISSIONS, type UnifiedPermission } from "./unified-permissions";

// Platform roles (subset of unified permissions)
export const PLATFORM_ROLE_PERMISSIONS: Record<string, readonly UnifiedPermission[]> = {
  PLATFORM_SUPER_ADMIN: [
    UNIFIED_PERMISSIONS.PLATFORM_TENANT_MANAGE,
    UNIFIED_PERMISSIONS.PLATFORM_TENANT_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_RELEASE_MANAGE,
    UNIFIED_PERMISSIONS.PLATFORM_RELEASE_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_ENTITLEMENT_MANAGE,
    UNIFIED_PERMISSIONS.PLATFORM_ENTITLEMENT_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_SUPER_USER_MANAGE,
    UNIFIED_PERMISSIONS.PLATFORM_ADMIN_SETTINGS_MANAGE,
    UNIFIED_PERMISSIONS.PLATFORM_RELIABILITY_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_PERFORMANCE_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_DATA_EXPORT,
    UNIFIED_PERMISSIONS.PLATFORM_DATA_IMPORT,
    UNIFIED_PERMISSIONS.PLATFORM_STORAGE_UPLOAD,
    UNIFIED_PERMISSIONS.PLATFORM_TENANT_CONFIG_MANAGE,
    UNIFIED_PERMISSIONS.PLATFORM_VERSIONING_MANAGE,
  ],
  PLATFORM_OPS: [
    UNIFIED_PERMISSIONS.PLATFORM_TENANT_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_RELEASE_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_ENTITLEMENT_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_RELIABILITY_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_PERFORMANCE_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_DATA_EXPORT,
  ],
  PLATFORM_SUPPORT: [
    UNIFIED_PERMISSIONS.PLATFORM_TENANT_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_RELEASE_VIEW,
    UNIFIED_PERMISSIONS.PLATFORM_ENTITLEMENT_VIEW,
  ],
};

// Tenant roles (existing ROLE_PERMISSIONS, typed as UnifiedPermission)
export const TENANT_ROLE_PERMISSIONS: Record<string, readonly UnifiedPermission[]> = {
  // ... existing ROLE_PERMISSIONS from permissions.ts
  // but typed as UnifiedPermission[]
};
```

#### **Step 3: Unified Permission Checker (Day 3)**
```typescript
// NEW FILE: lib/rbac/unified-guard.ts
import { type UnifiedPermission } from "./unified-permissions";
import { TENANT_ROLE_PERMISSIONS, PLATFORM_ROLE_PERMISSIONS } from "./unified-roles";

export interface UnifiedPrincipal {
  // Tenant context
  tenantRoleKey?: string;
  tenantCustomPermissions: readonly UnifiedPermission[];
  // Platform context
  platformRoleKey?: string;
  // Unified check
  hasPermission: (perm: UnifiedPermission) => boolean;
}

export function createUnifiedPrincipal(input: {
  tenantRoleKey?: string;
  tenantCustomPermissions?: readonly string[];
  platformRoleKey?: string;
}): UnifiedPrincipal {
  const tenantPerms = (input.tenantCustomPermissions || []).map(p => p as UnifiedPermission);
  const tenantRolePerms = input.tenantRoleKey 
    ? TENANT_ROLE_PERMISSIONS[input.tenantRoleKey] || []
    : [];
  const platformRolePerms = input.platformRoleKey
    ? PLATFORM_ROLE_PERMISSIONS[input.platformRoleKey] || []
    : [];

  const allPerms = new Set<UnifiedPermission>([
    ...tenantPerms,
    ...tenantRolePerms,
    ...platformRolePerms,
  ]);

  return {
    tenantRoleKey: input.tenantRoleKey,
    tenantCustomPermissions: tenantPerms,
    platformRoleKey: input.platformRoleKey,
    hasPermission: (perm: UnifiedPermission) => allPerms.has(perm),
  };
}
```

#### **Step 4: Migrate Guards (Days 4-6)**
```typescript
// MODIFY: lib/rbac/guard.ts
// - Replace requirePermission() → uses unified principal
// - Replace requirePlatformPermission() → uses unified principal
// - Keep requireModulePermission() (entitlement check, separate)

import { createUnifiedPrincipal } from "./unified-guard";

export async function requirePermission(
  request: NextRequest,
  permission: UnifiedPermission,
): Promise<UnifiedPrincipal> {
  const principal = await resolveRequestPrincipal(request); // existing
  const unified = createUnifiedPrincipal({
    tenantRoleKey: principal.roleKey,
    tenantCustomPermissions: principal.customPermissions,
    platformRoleKey: await getPlatformRole(principal.userId), // new lookup
  });

  if (!unified.hasPermission(permission)) {
    await auditDenial({ ... });
    throw new AuthorizationError(`Permission denied: ${permission}`, 403);
  }
  return unified;
}
```

#### **Step 5: Database Migration for Platform Roles (Day 7)**
```sql
-- NEW MIGRATION: 043_platform_roles.sql
CREATE TABLE IF NOT EXISTS platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES application_users(id) ON DELETE CASCADE,
  role_key text NOT NULL CHECK (role_key IN (
    'PLATFORM_SUPER_ADMIN', 'PLATFORM_OPS', 'PLATFORM_SUPPORT'
  )),
  granted_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, role_key)
);

CREATE INDEX idx_platform_roles_user ON platform_roles (user_id) WHERE revoked_at IS NULL;
```

#### **Step 6: Delete Old Platform RBAC (Day 8)**
- Delete `lib/nexus/platform-rbac.ts`
- Update all imports to use unified system
- Update `lib/rbac/request-principal.ts` to include `platformRoleKey`

### **Files to Modify**
| File | Action |
|------|--------|
| `lib/rbac/permissions.ts` | **Refactor** → export as `TENANT_PERMISSIONS`, import unified |
| `lib/nexus/platform-rbac.ts` | **DELETE** after migration |
| `lib/rbac/guard.ts` | **Rewrite** to use unified principal |
| `lib/rbac/request-principal.ts` | **Extend** with `platformRoleKey` |
| `lib/rbac/unified-permissions.ts` | **NEW** — single permission enum |
| `lib/rbac/unified-roles.ts` | **NEW** — role definitions |
| `lib/rbac/unified-guard.ts` | **NEW** — unified checker |
| `database/migrations/043_platform_roles.sql` | **NEW** — platform roles table |

### **Success Criteria**
- [ ] Single `UnifiedPermission` enum with all permissions
- [ ] `hasPermission()` checks both tenant + platform roles
- [ ] `platform-rbac.ts` deleted
- [ ] All API routes use unified guard
- [ ] Platform roles stored in DB, auditable
- [ ] Zero references to old `PlatformPermission` type

---

## 🎯 P2: DUPLICATE SERVICE CONSOLIDATION

### **Problem**
Same domain implemented in both `frontend/lib/` (TypeScript) AND `Agentic_AI/` (Python/TS) with no clear ownership.

### **Duplicate Map**

| Domain | Frontend (lib/) | Agentic_AI | **Recommended Owner** |
|--------|-----------------|------------|----------------------|
| **Duplicate Detection** | `lib/literature/duplicates/*`<br>`lib/safety/duplicate/*` | AG18 (lit), AG19 (ICSR) | **Agentic_AI** — core algorithmic, Python better for ML |
| **Screening** | `lib/literature/screening/*`<br>`lib/ai/screening-agent.ts` | AG17 (safety) | **Frontend** — workflow orchestration, TS better for UI integration |
| **Translation** | `lib/literature/translation/*` | AG10 | **Frontend** — used in UI, TS native |
| **Triage/Intake** | `lib/safety/triage/*`<br>`lib/safety/intake/*` | AG26 | **Split**: Frontend=workflow, Agentic_AI=ML classification |
| **Seriousness** | `lib/ai/seriousness-agent-client.ts` | AG11 | **Agentic_AI** — complex rules, Python native pipeline |
| **Causality** | — | AG13 | **Agentic_AI** — backend only |
| **Narrative Gen** | — | AG20 | **Agentic_AI** — backend only |

### **Ownership Principle**
| Layer | Owner | Rationale |
|-------|-------|-----------|
| **UI Workflow / Orchestration** | Frontend (lib/) | React integration, user-facing flows |
| **ML / Rule Engines / Complex Algorithms** | Agentic_AI | Python ecosystem, testable in isolation |
| **Data Access / Persistence** | Frontend (lib/) | Next.js Server Components, DB access |
| **External API Integration** | Agentic_AI | PubMed, MedDRA, FAERS clients |

### **Action Plan: Week 5-6**

#### **Step 1: Define Service Contracts (Days 1-2)**
For each duplicated domain, create a **contract file**:
```typescript
// NEW: lib/contracts/duplicate-detection.ts
export interface DuplicateDetectionService {
  findDuplicates(input: DuplicateInput): Promise<DuplicateResult[]>;
  checkDuplicate(candidate: RecordId, existing: RecordId[]): Promise<DuplicateMatch | null>;
}

export interface DuplicateInput {
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
}
```

#### **Step 2: Implement Adapters (Days 3-5)**
```typescript
// NEW: lib/adapters/agentic-ai-duplicate-adapter.ts
import { DuplicateDetectionService } from "@/lib/contracts/duplicate-detection";
// Calls Agentic_AI AG18/AG19 via HTTP or direct Python bridge

export class AgenticAIDuplicateAdapter implements DuplicateDetectionService {
  async findDuplicates(input: DuplicateInput) {
    // POST to /api/ai/duplicate-detection
  }
}
```

#### **Step 3: Remove Frontend Duplicates (Days 6-8)**
| Delete | Keep | Replace With |
|--------|------|--------------|
| `lib/literature/duplicates/*` | AG18/AG19 | `AgenticAIDuplicateAdapter` |
| `lib/safety/duplicate/*` | AG18/AG19 | `AgenticAIDuplicateAdapter` |
| `lib/ai/screening-agent.ts` | `lib/literature/screening/*` | Direct usage |
| `lib/ai/seriousness-agent-client.ts` | AG11 | `AgenticAISeriousnessAdapter` |
| `lib/literature/translation/*` | Frontend | Keep (TS native) |

#### **Step 4: Update API Routes (Days 9-10)**
- `/api/ai/duplicate-detection` → proxies to Agentic_AI
- `/api/ai/screening` → uses frontend screening service
- `/api/ai/seriousness` → proxies to AG11

### **Files to Modify**
| File | Action |
|------|--------|
| `lib/contracts/*.ts` | **NEW** — 5-6 contract files |
| `lib/adapters/*.ts` | **NEW** — adapter implementations |
| `lib/literature/duplicates/*` | **DELETE** |
| `lib/safety/duplicate/*` | **DELETE** |
| `lib/ai/screening-agent.ts` | **DELETE** |
| `lib/ai/seriousness-agent-client.ts` | **DELETE** |
| `app/api/ai/*/route.ts` | **UPDATE** to use adapters |

### **Success Criteria**
- [ ] Clear ownership per domain (no overlap)
- [ ] Contract files define interfaces
- [ ] Adapters bridge Frontend ↔ Agentic_AI
- [ ] Frontend duplicate code deleted
- [ ] API routes use adapters consistently

---

## 🎯 P3: DESIGN SYSTEM EXTRACTION

### **Problem**
No shared design tokens, components, or patterns. Each component uses inline styles/CSS modules.

### **Current State**
```
components/
├── AuthGate.tsx           # inline styles
├── Navigation.tsx         # CSS module
├── TenantSwitcher.tsx     # CSS module
├── SessionTimeoutGuard.tsx
├── WorkspaceContext.tsx   # no UI
├── legacy-hits/
│   └── LegacyHitsPage.tsx # different patterns
```

### **Action Plan: Week 7-8**

#### **Step 1: Extract Design Tokens (Day 1)**
```typescript
// NEW: lib/design/tokens.ts
export const tokens = {
  colors: {
    primary: { 50: '#eff6ff', 100: '#dbeafe', ..., 900: '#1e3a8a' },
    neutral: { 50: '#fafafa', ..., 900: '#171717' },
    semantic: {
      success: '#16a34a',
      warning: '#f59e0b',
      error: '#dc2626',
      info: '#2563eb',
    },
  },
  spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px' },
  typography: {
    fontFamilies: { sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace' },
    fontSizes: { xs: '12px', sm: '14px', base: '16px', lg: '18px', xl: '20px', '2xl': '24px', '3xl': '30px' },
    fontWeights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
  },
  radii: { none: '0', sm: '4px', md: '8px', lg: '12px', full: '9999px' },
  shadows: { sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)', md: '0 4px 6px -1px rgb(0 0 0 / 0.1)', lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
  transitions: { fast: '150ms ease', normal: '200ms ease', slow: '300ms ease' },
  breakpoints: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
} as const;
```

#### **Step 2: Build Primitive Components (Days 2-4)**
```tsx
// NEW: components/ui/Button.tsx
import { tokens } from "@/lib/design/tokens";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  const base = `inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed`;
  const variants = {
    primary: `bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`,
    secondary: `bg-neutral-100 text-neutral-900 hover:bg-neutral-200 focus:ring-neutral-500`,
    ghost: `bg-transparent text-neutral-700 hover:bg-neutral-100 focus:ring-neutral-500`,
    danger: `bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`,
  };
  const sizes = {
    sm: `px-3 py-1.5 text-sm gap-1.5`,
    md: `px-4 py-2 text-base gap-2`,
    lg: `px-6 py-3 text-lg gap-2.5`,
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>{children}</button>;
}
```

Build: `Button`, `Input`, `Select`, `Card`, `Table`, `Modal`, `Toast`, `Badge`, `Avatar`, `Dropdown`, `Tabs`, `Tooltip`

#### **Step 3: Build Composite Components (Days 5-7)**
```tsx
// NEW: components/ui/DataTable.tsx — replaces inline tables everywhere
// NEW: components/ui/FormField.tsx — consistent form patterns
// NEW: components/ui/PageHeader.tsx — consistent page titles/actions
// NEW: components/ui/EmptyState.tsx — consistent empty states
```

#### **Step 4: Migrate Existing Components (Day 8)**
- `Navigation.tsx` → use `Button`, `Dropdown`, `Avatar`
- `TenantSwitcher.tsx` → use `Select`, `Card`
- `AuthGate.tsx` → use `Card`, `Input`, `Button`
- `LegacyHitsPage.tsx` → **DELETE** (legacy)

#### **Step 5: Document & Publish (Day 9-10)**
- Create `STORYBOOK.md` or run Storybook
- Add `components/ui/index.ts` exports
- Update `tsconfig.json` paths for `@/components/ui/*`

### **Files to Create**
| File | Purpose |
|------|---------|
| `lib/design/tokens.ts` | Single source of truth for design values |
| `components/ui/*.tsx` | 15-20 primitive + composite components |
| `components/ui/index.ts` | Public exports |
| `.storybook/` (optional) | Component documentation |

### **Files to Delete**
- `components/legacy-hits/LegacyHitsPage.tsx`

### **Success Criteria**
- [ ] All design values in `tokens.ts`
- [ ] 15+ reusable UI components
- [ ] Zero inline styles in new components
- [ ] `Navigation`, `TenantSwitcher`, `AuthGate` migrated
- [ ] Legacy hits page deleted

---

## 📦 EXECUTION CHECKLIST

### **Week 1-2: Agentic_AI Consolidation**
- [ ] Decision log created
- [ ] Each agent: compare branches, pick one, move to `src/canonical/`
- [ ] Special cases handled (AG17, AG24, missing agents)
- [ ] All `src/branches/` deleted
- [ ] Registries updated

### **Week 3-4: RBAC Unification**
- [ ] `unified-permissions.ts` created
- [ ] `unified-roles.ts` created
- [ ] `unified-guard.ts` created
- [ ] `guard.ts` rewritten
- [ ] `request-principal.ts` extended
- [ ] Migration `043_platform_roles.sql` applied
- [ ] `platform-rbac.ts` deleted
- [ ] All imports updated

### **Week 5-6: Service Consolidation**
- [ ] Contract files created (5-6)
- [ ] Adapters implemented
- [ ] Frontend duplicate code deleted
- [ ] API routes updated
- [ ] Integration tests pass

### **Week 7-8: Design System**
- [ ] `tokens.ts` created
- [ ] Primitive components built
- [ ] Composite components built
- [ ] Existing components migrated
- [ ] Legacy deleted

---

## 🚨 RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Branch consolidation breaks agent | Medium | High | Run tests per agent before delete; keep git history |
| RBAC unification causes auth regressions | Low | Critical | Feature flag; canary deploy; extensive integration tests |
| Service contracts mismatch | Medium | Medium | Contract-first: define TS interfaces before implementation |
| Design system adoption resistance | Low | Low | Migrate incrementally; don't block feature work |

---

## 📊 SUCCESS METRICS

| Metric | Before | Target After |
|--------|--------|--------------|
| Agentic_AI source files | ~200+ (with branches) | ~80 (canonical only) |
| RBAC systems | 2 parallel | 1 unified |
| Duplicate service pairs | 7 domains | 0 (clear ownership) |
| Design token files | 0 | 1 (`tokens.ts`) |
| Reusable UI components | 0 | 15+ |
| `live_integration: verified` agents | 6 | 20+ |
| Lines of code (approx) | ~45,000 | ~25,000 (-45%) |

---

## 🎯 NEXT STEPS

1. **Approve this plan** — confirm priorities and timeline
2. **Assign owners** — one per work package
3. **Create GitHub issues** — track each step
4. **Start P0** — Agentic_AI consolidation (highest ROI)
5. **Weekly sync** — review progress, adjust

---

**This plan transforms a "monorepo of prototypes" into a maintainable platform. The architecture is already sound — consolidation unlocks its value.**