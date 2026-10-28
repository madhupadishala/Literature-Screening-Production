"use client";
import { useId, useState, type ReactNode, type KeyboardEvent } from "react";
import s from "./primitives.module.css";
export type TabItem = { id: string; label: string; content: ReactNode; disabled?: boolean };
export function Tabs({ items }: { items: readonly TabItem[] }) {
  const uid = useId();
  const [active, setActive] = useState(items.find((x) => !x.disabled)?.id ?? "");
  const keyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const valid = items.filter((x) => !x.disabled);
    const i = valid.findIndex((x) => x.id === id);
    if (i < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? valid[0]
        : e.key === "End"
          ? valid[valid.length - 1]
          : valid[(i + (e.key === "ArrowRight" ? 1 : -1) + valid.length) % valid.length];
    setActive(next.id);
    document.getElementById(uid + "-tab-" + next.id)?.focus();
  };
  return (
    <div>
      <div role="tablist" className={s.tabs}>
        {items.map((item) => (
          <button
            role="tab"
            key={item.id}
            id={uid + "-tab-" + item.id}
            aria-controls={uid + "-panel-" + item.id}
            aria-selected={active === item.id}
            tabIndex={active === item.id ? 0 : -1}
            disabled={item.disabled}
            className={s.tab}
            onClick={() => setActive(item.id)}
            onKeyDown={(e) => keyDown(e, item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={uid + "-panel-" + item.id}
          aria-labelledby={uid + "-tab-" + item.id}
          role="tabpanel"
          hidden={active !== item.id}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
export default Tabs;
