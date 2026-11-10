import type { HTMLAttributes, ReactNode } from "react";

import styles from "./data-primitives.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <section {...props} className={[styles.card, className].filter(Boolean).join(" ")}>
      {children}
    </section>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <header {...props} className={[styles.cardHeader, className].filter(Boolean).join(" ")}>
      {children}
    </header>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 {...props} className={[styles.cardTitle, className].filter(Boolean).join(" ")}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p {...props} className={[styles.cardDescription, className].filter(Boolean).join(" ")}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <div {...props} className={[styles.cardContent, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <footer {...props} className={[styles.cardFooter, className].filter(Boolean).join(" ")}>
      {children}
    </footer>
  );
}

export default Card;