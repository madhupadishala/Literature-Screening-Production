import type { SignalStatus } from "@/lib/signals/signal-types";

export const SIGNAL_ALLOWED_TRANSITIONS: Readonly<Record<SignalStatus, readonly SignalStatus[]>> = {
  DETECTED: ["VALIDATED", "REFUTED"],
  VALIDATED: ["UNDER_EVALUATION", "REFUTED"],
  UNDER_EVALUATION: ["CONFIRMED", "REFUTED"],
  CONFIRMED: ["CLOSED"],
  REFUTED: ["CLOSED"],
  CLOSED: [],
};

export function allowedSignalTransitions(status: string): readonly SignalStatus[] {
  return Object.prototype.hasOwnProperty.call(SIGNAL_ALLOWED_TRANSITIONS, status)
    ? SIGNAL_ALLOWED_TRANSITIONS[status as SignalStatus]
    : [];
}

export function isSignalApprovalTransition(status: string): boolean {
  return status === "CONFIRMED" || status === "CLOSED";
}

export function validAggregatePeriod(start: string, end: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const a = new Date(start), b = new Date(end);
  return Number.isFinite(a.valueOf()) && Number.isFinite(b.valueOf())
    && a.toISOString().slice(0, 10) === start
    && b.toISOString().slice(0, 10) === end
    && end >= start;
}
