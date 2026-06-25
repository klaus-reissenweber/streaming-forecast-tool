"use client";

import { useEffect, useState } from "react";

function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

function getMotionDurationCountMs(): number {
  if (typeof window === "undefined") {
    return 300;
  }

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--motion-duration-count")
    .trim();

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 300;
}

export interface UseCountUpOptions {
  /** Delay before animation starts, in milliseconds. */
  delay?: number;
  /** When false, value jumps immediately to target. */
  enabled?: boolean;
}

/**
 * Animates from 0 to `target` over --motion-duration-count (300ms default, 0ms
 * when prefers-reduced-motion is active). Returns the current interpolated value.
 */
export function useCountUp(
  target: number,
  options?: UseCountUpOptions,
): number {
  const { delay = 0, enabled = true } = options ?? {};
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      setValue(target);
      return;
    }

    const durationMs = getMotionDurationCountMs();
    if (durationMs === 0) {
      setValue(target);
      return;
    }

    let rafId = 0;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      setValue(target * easeOutExpo(progress));

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        setValue(target);
      }
    };

    const delayTimeout = window.setTimeout(() => {
      rafId = requestAnimationFrame(animate);
    }, delay);

    return () => {
      window.clearTimeout(delayTimeout);
      cancelAnimationFrame(rafId);
    };
  }, [target, delay, enabled]);

  return value;
}
