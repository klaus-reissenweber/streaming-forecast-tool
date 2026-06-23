"use server";

import { redirect } from "next/navigation";
import { computeLockedForecast } from "@/lib/forecast";
import { loadForecastData } from "@/lib/load-forecast-data";
import {
  toNewReleaseInsertRow,
  toReleaseForecastInputs,
} from "@/lib/map-new-release";
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
    const { coefficients, adRates, modelVersionId } = await loadForecastData();
    const inputs = toReleaseForecastInputs(parsed.values);
    const forecast = computeLockedForecast(inputs, coefficients, adRates);

    const row = toNewReleaseInsertRow(parsed.values, {
      lockedForecastStreams: forecast.streams.week1Streams,
      lockedForecastSaves: forecast.saves.week1Saves,
      modelVersionId,
    });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("releases")
      .insert(row)
      .select("id")
      .single();

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
