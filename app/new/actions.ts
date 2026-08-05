"use server";

import { redirect } from "next/navigation";
import { computeLockedForecast } from "@/lib/forecast";
import { loadActiveModel } from "@/lib/load-active-model";
import { loadForecastData } from "@/lib/load-forecast-data";
import {
  toNewReleaseInsertRow,
  toReleaseForecastInputs,
} from "@/lib/map-new-release";
import { logActiveModelSource } from "@/lib/model/forecast-model";
import { rawValuesFromFormData } from "@/lib/parse-new-release-form-data";
import {
  RELEASE_SAVE_ERROR_FATAL,
  releaseSaveErrorMessage,
} from "@/lib/release-save-error";
import { createClient } from "@/lib/supabase/server";
import {
  parseAndValidateNewReleaseForm,
  type NewReleaseFieldKey,
  type NewReleaseFormRawValues,
} from "@/lib/validate-new-release";

export type CreateReleaseResult =
  | {
      success: false;
      fieldErrors?: Partial<Record<NewReleaseFieldKey, string>>;
      formErrors?: string[];
      error?: string;
    };

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: string }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createRelease(
  raw: NewReleaseFormRawValues,
): Promise<CreateReleaseResult> {
  const parsed = parseAndValidateNewReleaseForm(raw);

  if (!parsed.valid) {
    return {
      success: false,
      fieldErrors: parsed.fieldErrors,
      formErrors: parsed.formErrors,
    };
  }

  try {
    const [model, forecastData] = await Promise.all([
      loadActiveModel(),
      loadForecastData(),
    ]);
    logActiveModelSource(model, "createRelease");

    const { coefficients, adRates, modelVersionId: legacyVersionId } =
      forecastData;
    // Prefer consolidated version row id when reading from DB.
    const modelVersionId =
      model.source === "db" && model.id ? model.id : legacyVersionId;

    // Active model owns streams_d0 + curve/bands; refinement d1–d7 stay legacy.
    const coefficientsWithActiveD0 = {
      ...coefficients,
      streams: {
        ...coefficients.streams,
        streams_d0: model.streamsD0,
      },
    };

    const inputs = toReleaseForecastInputs(parsed.values);
    const forecast = computeLockedForecast(
      inputs,
      coefficientsWithActiveD0,
      adRates,
      model,
      { releaseDate: parsed.values.releaseDate },
    );

    const row = toNewReleaseInsertRow(parsed.values, {
      lockedForecastStreams: forecast.streams.week1Streams,
      lockedForecastSaves: forecast.saves.week1Saves,
      modelVersionId,
    });

    const supabase = await createClient();
    let { data, error } = await supabase
      .from("releases")
      .insert(row)
      .select("id")
      .single();

    // Split Meta columns require 202608050001; retry without them if absent.
    if (
      error &&
      (error.message?.includes("meta_traffic_spend_planned") ||
        error.message?.includes("meta_awareness_spend_planned") ||
        error.code === "PGRST204")
    ) {
      if (
        parsed.values.metaTrafficSpendPlanned > 0 &&
        parsed.values.metaAwarenessSpendPlanned > 0
      ) {
        return {
          success: false,
          error:
            "Split Meta traffic/awareness spend requires migration 202608050001. Apply it, or enter only one Meta spend type.",
        };
      }
      const {
        meta_traffic_spend_planned: _t,
        meta_awareness_spend_planned: _a,
        ...legacyRow
      } = row;
      ({ data, error } = await supabase
        .from("releases")
        .insert(legacyRow)
        .select("id")
        .single());
    }

    if (error || !data?.id) {
      if (error) {
        return {
          success: false,
          error: releaseSaveErrorMessage(error),
        };
      }
      return {
        success: false,
        error: RELEASE_SAVE_ERROR_FATAL,
      };
    }

    redirect(`/release/${data.id}`);
  } catch (err) {
    if (isNextRedirectError(err)) {
      throw err;
    }

    return {
      success: false,
      error: RELEASE_SAVE_ERROR_FATAL,
    };
  }
}

export async function createReleaseFromFormData(
  formData: FormData,
): Promise<CreateReleaseResult> {
  return createRelease(rawValuesFromFormData(formData));
}
