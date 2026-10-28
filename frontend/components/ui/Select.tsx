import type { SelectHTMLAttributes } from "react";
import s from "./primitives.module.css";
export type SelectOption = { value: string; label: string };
type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly SelectOption[];
  finalized?: boolean;
};
export function Select({ options, finalized, disabled, className, ...props }: Props) {
  return (
    <select
      {...props}
      disabled={disabled || finalized}
      className={[s.control, className].filter(Boolean).join(" ")}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
export default Select;
