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
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Daily entry</h2>
          <p className="mt-1 text-sm text-stone-500">
            D1–D28 · streams, saves, and source-of-streams Other %
          </p>
        </div>
        {readOnly ? (
          <p className="mt-2 text-xs font-medium text-stone-500 sm:mt-0">
            Closed release · read only
          </p>
        ) : (
          <p className="mt-2 text-xs font-medium text-stone-400 sm:mt-0">
            Saves on blur
          </p>
        )}
      </div>

      {sectionError ? (
        <p className="mt-3 text-sm text-red-700">{sectionError}</p>
      ) : null}

      <DailyEntryGrid
        grid={grid}
        readOnly={readOnly}
        dayStatus={dayStatus}
        onCellChange={handleCellChange}
        onDayBlur={handleDayBlur}
      />

      <DailyDataImport
        releaseId={releaseId}
        readOnly={readOnly}
        onImportSuccess={refreshPage}
      />
    </section>
  );
}
