import {
  MAX_RELEASE_ARTISTS,
  MIN_ARTIST_MONTHLY_LISTENERS,
  MAX_ARTIST_MONTHLY_LISTENERS,
  isArtistRole,
  type ArtistRole,
  type ReleaseArtistDraft,
  type ReleaseArtistWriteRow,
} from "@/lib/release-artists";

export type RosterValidationResult =
  | { valid: true; rows: ReleaseArtistWriteRow[]; errors: [] }
  | { valid: false; rows: null; errors: string[] };

function draftHasContent(draft: ReleaseArtistDraft): boolean {
  const name = draft.name.trim();
  const ml =
    typeof draft.monthlyListeners === "string"
      ? draft.monthlyListeners.trim()
      : draft.monthlyListeners;
  const hasMl =
    ml !== "" && ml != null && !(typeof ml === "number" && !Number.isFinite(ml));
  return Boolean(name || draft.role || hasMl);
}

function parseMonthlyListeners(
  raw: number | string,
  label: string,
  { required }: { required: boolean },
): { value: number | null; error?: string } {
  if (raw === null || raw === undefined) {
    return required
      ? { value: null, error: `${label}: monthly listeners is required.` }
      : { value: null };
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return required
      ? { value: null, error: `${label}: monthly listeners is required.` }
      : { value: null };
  }
  const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(parsed)) {
    return { value: null, error: `${label}: monthly listeners must be a number.` };
  }
  if (!Number.isInteger(parsed)) {
    return {
      value: null,
      error: `${label}: monthly listeners must be a whole number.`,
    };
  }
  if (parsed < MIN_ARTIST_MONTHLY_LISTENERS) {
    return {
      value: null,
      error: `${label}: monthly listeners must be greater than 0.`,
    };
  }
  if (parsed > MAX_ARTIST_MONTHLY_LISTENERS) {
    return {
      value: null,
      error: `${label}: monthly listeners cannot exceed ${MAX_ARTIST_MONTHLY_LISTENERS.toLocaleString()}.`,
    };
  }
  return { value: parsed };
}

/**
 * Validate a roster edit. Enforces max 4, exactly one primary, unique
 * positions 1..n, named rows, and ML rules (primary required, others optional).
 */
export function validateReleaseRoster(
  drafts: readonly ReleaseArtistDraft[],
): RosterValidationResult {
  const errors: string[] = [];
  const filled = drafts.filter(draftHasContent);

  if (filled.length < 1) {
    return {
      valid: false,
      rows: null,
      errors: ["Add at least one artist with an explicit role."],
    };
  }
  if (filled.length > MAX_RELEASE_ARTISTS) {
    return {
      valid: false,
      rows: null,
      errors: [`At most ${MAX_RELEASE_ARTISTS} artists.`],
    };
  }

  const rows: ReleaseArtistWriteRow[] = [];
  for (let index = 0; index < filled.length; index += 1) {
    const draft = filled[index]!;
    const label = `Artist ${index + 1}`;
    const name = draft.name.trim();
    if (!name) {
      errors.push(`${label}: name is required.`);
    }
    if (!isArtistRole(draft.role)) {
      errors.push(`${label}: pick an explicit role.`);
    }
    const isPrimary = draft.role === "primary";
    const ml = parseMonthlyListeners(draft.monthlyListeners, label, {
      required: isPrimary,
    });
    if (ml.error) {
      errors.push(ml.error);
    }

    const role: ArtistRole | "" = isArtistRole(draft.role) ? draft.role : "";
    if (name && role) {
      rows.push({
        artist_name: name,
        monthly_listeners: ml.value,
        role,
        position: index + 1,
      });
    }
  }

  const primaryCount = rows.filter((row) => row.role === "primary").length;
  if (primaryCount !== 1) {
    errors.push(
      "Exactly one artist must have the primary role (the forecast identity).",
    );
  }

  const positions = rows.map((row) => row.position);
  if (new Set(positions).size !== positions.length) {
    errors.push("Each artist must have a unique position.");
  }
  for (const position of positions) {
    if (!Number.isInteger(position) || position < 1 || position > MAX_RELEASE_ARTISTS) {
      errors.push("Position must be a whole number from 1 to 4.");
      break;
    }
  }

  if (errors.length > 0) {
    return { valid: false, rows: null, errors };
  }
  return { valid: true, rows, errors: [] };
}
