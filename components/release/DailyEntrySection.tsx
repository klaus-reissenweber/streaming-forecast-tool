"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertDailyDay } from "@/app/release/[id]/actions";
import {
  DailyEntryGrid,
  type DaySaveState,
} from "@/components/release/DailyEntryGrid";
import { DailyDataImport } from "@/components/release/DailyDataImport";
import {
  buildInitialDayGrid,
  dayFieldsFromGrid,
  type DayFieldKey,
  type DayGridState,
} from "@/lib/daily-entry-grid-state";
import type { DailyDataPoint, ReleaseStatus } from "@/lib/map-release-row";

const SAVE_DEBOUNCE_MS = 300;

export interface DailyEntrySectionProps {
  releaseId: string;
  initialDailyData: DailyDataPoint[];
  status: ReleaseStatus;
}

export function DailyEntrySection({
  releaseId,
  initialDailyData,
  status,
}: DailyEntrySectionProps) {
  const router = useRouter();
  const readOnly = status === "closed";

  const [grid, setGrid] = useState<DayGridState>(() =>
    buildInitialDayGrid(initialDailyData),
  );
  const [dayStatus, setDayStatus] = useState<Record<number, DaySaveState>>({});
  const [sectionError, setSectionError] = useState<string | null>(null);

  const gridRef = useRef(grid);
  gridRef.current = grid;

  const saveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    setGrid(buildInitialDayGrid(initialDailyData));
  }, [initialDailyData]);

  useEffect(() => {
    return () => {
      for (const timer of saveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      saveTimersRef.current.clear();
    };
  }, []);

  const refreshPage = useCallback(() => {
    router.refresh();
  }, [router]);

  const persistDay = useCallback(
    async (dayNumber: number) => {
      const fields = dayFieldsFromGrid(gridRef.current, dayNumber);

      setDayStatus((current) => ({
        ...current,
        [dayNumber]: { status: "saving" },
      }));
      setSectionError(null);

      const result = await upsertDailyDay(releaseId, dayNumber, fields);

      if (!result.success) {
        setDayStatus((current) => ({
          ...current,
          [dayNumber]: {
            status: "error",
            message: result.error,
          },
        }));
        setSectionError(result.error);
        return;
      }

      setDayStatus((current) => ({
        ...current,
        [dayNumber]: { status: "saved" },
      }));
      refreshPage();
    },
    [releaseId, refreshPage],
  );

  const scheduleDaySave = useCallback(
    (dayNumber: number) => {
      if (readOnly) {
        return;
      }

      const existing = saveTimersRef.current.get(dayNumber);
      if (existing) {
        clearTimeout(existing);
      }

      setDayStatus((current) => ({
        ...current,
        [dayNumber]: { status: "pending" },
      }));

      const timer = setTimeout(() => {
        saveTimersRef.current.delete(dayNumber);
        void persistDay(dayNumber);
      }, SAVE_DEBOUNCE_MS);

      saveTimersRef.current.set(dayNumber, timer);
    },
    [persistDay, readOnly],
  );

  function handleCellChange(day: number, field: DayFieldKey, value: string) {
    setGrid((current) => {
      const next = [...current];
      const dayIndex = day - 1;
      next[dayIndex] = {
        ...next[dayIndex],
        [field]: value,
      };
      return next;
    });

    setDayStatus((current) => {
      if (current[day]?.status === "error") {
        return {
          ...current,
          [day]: { status: "idle" },
        };
      }
      return current;
    });
  }

  function handleDayBlur(day: number) {
    scheduleDaySave(day);
  }

  return (
    <section className="motion-fade-up" aria-label="Daily data">
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [DAILY DATA]
        </span>
      </h2>

      <div className="mt-4 rounded-instrument border border-border bg-surface p-5">
        {sectionError ? (
          <p className="mb-3 text-body-sm text-semantic-negative">{sectionError}</p>
        ) : null}

        <DailyEntryGrid
          grid={grid}
          readOnly={readOnly}
          dayStatus={dayStatus}
          onCellChange={handleCellChange}
          onDayBlur={handleDayBlur}
        />

        {!readOnly ? (
          <DailyDataImport
            releaseId={releaseId}
            readOnly={readOnly}
            onImportSuccess={refreshPage}
          />
        ) : null}
      </div>
    </section>
  );
}
