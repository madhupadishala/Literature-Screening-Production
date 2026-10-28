import type { HTMLAttributes } from "react";

import styles from "./primitives.module.css";

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={[styles.card, className].filter(Boolean).join(" ")}>
      {children}
    </section>
  );
}

export default Card;
