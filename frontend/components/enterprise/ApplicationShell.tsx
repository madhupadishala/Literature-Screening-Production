import type { ReactNode } from "react";

import Navigation from "@/components/Navigation";
import ModuleSubNavigation from "@/components/ModuleSubNavigation";

import styles from "./ApplicationShell.module.css";

type ShellModule = "LITERATURE" | "INTAKE";

type ApplicationShellProps = {
  children: ReactNode;
  module?: ShellModule;
  className?: string;
};

export default function ApplicationShell({
  children,
  module,
  className,
}: ApplicationShellProps) {
  return (
    <main
      id="main-content"
      className={[styles.shell, className].filter(Boolean).join(" ")}
    >
      <Navigation />
      {module ? <ModuleSubNavigation module={module} /> : null}
      <div className={styles.content}>{children}</div>
    </main>
  );
}
