"use client";

import { useEffect, useEffectEvent } from "react";

type DeferredLoader = () => Promise<void> | void;

/**
 * Runs an imperative data loader after React has committed the component.
 *
 * Deferring the callback prevents mount-time loading state transitions from
 * cascading through the effect itself. The effect event always invokes the
 * latest loader implementation without making function identity a dependency.
 */
export function useDeferredLoad(
  loader: DeferredLoader,
  dependency?: string,
): void {
  const runLoader = useEffectEvent(loader);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      Promise.resolve(runLoader()).catch((error: unknown) => {
        console.error("Deferred component data load failed.", error);
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dependency]);
}
