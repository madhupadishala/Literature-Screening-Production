export type UiModuleKey = "LITERATURE" | "INTAKE" | "CASE_PROCESSING" | "SUBMISSIONS" | "SIGNAL_MANAGEMENT" | "AGGREGATE_REPORTING" | "PV_DOCUMENTATION";
export type UiModuleItem = { label: string; path: string; activePrefixes?: readonly string[] };
export type UiModuleDefinition = { label: string; path: string; activePrefixes: readonly string[]; screens: readonly UiModuleItem[] };
export const UI_MODULE_REGISTRY: Record<UiModuleKey, UiModuleDefinition> = {
  LITERATURE: { label: "Literature Screening", path: "/literature/dashboard", activePrefixes: ["/literature", "/literature-search", "/workflow", "/hits", "/screening", "/review"], screens: [
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
  SIGNAL_MANAGEMENT: { label: "Signal Management", path: "/signals", activePrefixes: ["/signals"], screens: [
    { label: "Signals", path: "/signals" },
  ] },
  AGGREGATE_REPORTING: { label: "Aggregate Reporting", path: "/aggregate-reports", activePrefixes: ["/aggregate-reports"], screens: [
    { label: "Aggregate Reports", path: "/aggregate-reports" },
  ] },
  PV_DOCUMENTATION: { label: "PV Documents", path: "/pv-documents", activePrefixes: ["/pv-documents"], screens: [{ label: "Documents", path: "/pv-documents" }] },
};
export const UI_MODULE_ORDER: readonly UiModuleKey[] = ["LITERATURE", "INTAKE", "CASE_PROCESSING", "SUBMISSIONS", "SIGNAL_MANAGEMENT", "AGGREGATE_REPORTING", "PV_DOCUMENTATION"];
export function matchesUiPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}
export function detectUiModule(pathname: string): UiModuleKey | undefined {
  return UI_MODULE_ORDER.find(key => UI_MODULE_REGISTRY[key].activePrefixes.some(prefix => matchesUiPath(pathname, prefix)));
}
