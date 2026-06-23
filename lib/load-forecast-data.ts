import { createClient } from "@/lib/supabase/server";
import type {
  AdRates,
  ForecastCoefficients,
  RegressionModel,
  SavesModel,
  StreamsModelKey,
  StreamsModelSet,
} from "@/lib/forecast";

const STREAM_MODEL_KEYS: StreamsModelKey[] = [
  "streams_d0",
  "streams_d1",
  "streams_d2",
  "streams_d3",
  "streams_d4",
  "streams_d5",
  "streams_d6",
  "streams_d7",
];

interface ModelCoefficientRow {
  id: string;
  model_type: string;
  coefficients_json: unknown;
}

async function fetchActiveModelRows(): Promise<ModelCoefficientRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("model_coefficients")
    .select("id, model_type, coefficients_json")
    .eq("is_active", true);

  if (error) {
    throw new Error(`model_coefficients: ${error.message}`);
  }

  const rows = (data ?? []) as ModelCoefficientRow[];
  if (rows.length === 0) {
    throw new Error("No active model coefficients found");
  }

  return rows;
}

function parseForecastCoefficients(rows: ModelCoefficientRow[]): ForecastCoefficients {
  const streams = {} as StreamsModelSet;
  let saves: SavesModel | null = null;

  for (const row of rows) {
    if (row.model_type === "saves") {
      saves = row.coefficients_json as SavesModel;
      continue;
    }
    if (STREAM_MODEL_KEYS.includes(row.model_type as StreamsModelKey)) {
      streams[row.model_type as StreamsModelKey] =
        row.coefficients_json as RegressionModel;
    }
  }

  for (const key of STREAM_MODEL_KEYS) {
    if (!streams[key]) {
      throw new Error(`Missing active coefficient row: ${key}`);
    }
  }
  if (!saves) {
    throw new Error("Missing active coefficient row: saves");
  }

  return { streams, saves };
}

function parseAdRates(rows: ModelCoefficientRow[]): AdRates {
  const adRatesRow = rows.find((row) => row.model_type === "ad_rates");
  if (!adRatesRow) {
    throw new Error("Missing active coefficient row: ad_rates");
  }

  const payload = adRatesRow.coefficients_json as AdRates;
  if (!payload?.spotify_rates) {
    throw new Error(
      "ad_rates coefficients_json is missing spotify_rates",
    );
  }

  return payload;
}

function parseModelVersionId(rows: ModelCoefficientRow[]): string {
  const streamsD0 = rows.find((row) => row.model_type === "streams_d0");
  if (!streamsD0?.id) {
    throw new Error("Missing active coefficient row: streams_d0 (with id)");
  }
  return streamsD0.id;
}

export async function loadForecastData(): Promise<{
  coefficients: ForecastCoefficients;
  adRates: AdRates;
  modelVersionId: string;
}> {
  const rows = await fetchActiveModelRows();
  return {
    coefficients: parseForecastCoefficients(rows),
    adRates: parseAdRates(rows),
    modelVersionId: parseModelVersionId(rows),
  };
}

export async function loadForecastCoefficients(): Promise<ForecastCoefficients> {
  const rows = await fetchActiveModelRows();
  return parseForecastCoefficients(rows);
}

export async function loadAdRates(): Promise<AdRates> {
  const rows = await fetchActiveModelRows();
  return parseAdRates(rows);
}
