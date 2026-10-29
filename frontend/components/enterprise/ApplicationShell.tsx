"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Navigation from "@/components/Navigation";
import ModuleSubNavigation from "@/components/ModuleSubNavigation";
import { detectUiModule, type UiModuleKey } from "@/lib/nexus/ui-module-registry";
import styles from "./ApplicationShell.module.css";
type ApplicationShellProps = { children: ReactNode; module?: UiModuleKey; className?: string };
export default function ApplicationShell({children,module,className}: ApplicationShellProps) {
  const pathname = usePathname();
  const resolvedModule = module ?? detectUiModule(pathname);
  return <main id="main-content" className={[styles.shell,className].filter(Boolean).join(" ")}>
    <Navigation />
    {resolvedModule ? <ModuleSubNavigation module={resolvedModule} /> : null}
    <div className={styles.content}>{children}</div>
  </main>;
}
