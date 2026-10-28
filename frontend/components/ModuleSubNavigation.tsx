"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI_MODULE_REGISTRY, matchesUiPath, type UiModuleKey } from "@/lib/nexus/ui-module-registry";
import styles from "./ModuleSubNavigation.module.css";
export default function ModuleSubNavigation({ module }: { module: UiModuleKey }) {
  const pathname = usePathname();
  return <nav className={styles.root} aria-label={UI_MODULE_REGISTRY[module].label + " screens"}>
    {UI_MODULE_REGISTRY[module].screens.map(item => {
      const isActive = (item.activePrefixes ?? [item.path]).some(prefix => matchesUiPath(pathname, prefix));
      return <Link key={item.path} href={item.path} className={styles.link} aria-current={isActive ? "page" : undefined}>{item.label}</Link>;
    })}
  </nav>;
}
