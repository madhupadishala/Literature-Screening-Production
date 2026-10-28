export type UiModuleKey = "LITERATURE" | "INTAKE" | "CASE_PROCESSING" | "SUBMISSIONS";
export type UiModuleItem = { label: string; path: string; activePrefixes?: readonly string[] };
export type UiModuleDefinition = { label: string; path: string; activePrefixes: readonly string[]; screens: readonly UiModuleItem[] };
export const UI_MODULE_REGISTRY: Record<UiModuleKey, UiModuleDefinition> = {
  LITERATURE: { label: "Literature Screening", path: "/literature/dashboard", activePrefixes: ["/literature", "/literature-search", "/workflow", "/hits", "/screening", "/review", "/reports"], screens: [
    { label: "Dashboard", path: "/literature/dashboard" },
    { label: "Hits", path: "/hits" },
    { label: "Screening", path: "/screening" },
    { label: "Medical Review", path: "/review" },
    { label: "Administration", path: "/literature/admin", activePrefixes: ["/literature/admin", "/admin/literature-calendar", "/admin/literature-scheduler", "/admin/products"] },
  ] },
  INTAKE: { label: "Intake", path: "/intake", activePrefixes: ["/intake"], screens: [
    { label: "Intake", path: "/intake" },
    { label: "Duplicate Check", path: "/intake/duplicate-check" },
    { label: "Triage", path: "/intake/triage" },
    { label: "Medical Review", path: "/intake/medical-review" },
  ] },
  CASE_PROCESSING: { label: "Case Processing", path: "/cases", activePrefixes: ["/cases"], screens: [
    { label: "Cases", path: "/cases" },
  ] },
  SUBMISSIONS: { label: "Submissions", path: "/submissions", activePrefixes: ["/submissions"], screens: [
    { label: "Submissions", path: "/submissions" },
  ] },
};
export const UI_MODULE_ORDER: readonly UiModuleKey[] = ["LITERATURE", "INTAKE", "CASE_PROCESSING", "SUBMISSIONS"];
export function matchesUiPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}
export function detectUiModule(pathname: string): UiModuleKey | undefined {
  return UI_MODULE_ORDER.find(key => UI_MODULE_REGISTRY[key].activePrefixes.some(prefix => matchesUiPath(pathname, prefix)));
}
