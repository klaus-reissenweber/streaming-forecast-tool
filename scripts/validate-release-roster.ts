/**
 * npx tsx scripts/validate-release-roster.ts
 * Roster edit constraints (max 4, one primary, unique position).
 */
import { validateReleaseRoster } from "../lib/validate-release-roster";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const valid = validateReleaseRoster([
  { name: "Kasango", monthlyListeners: 500_000, role: "remixer" },
  { name: "Original Act", monthlyListeners: 6_200_000, role: "primary" },
]);
assert(valid.valid, "valid two-artist roster");
assert(valid.rows?.[0]?.position === 1, "position 1");
assert(valid.rows?.[1]?.position === 2, "position 2");
assert(valid.rows?.[1]?.role === "primary", "primary preserved");

const noPrimary = validateReleaseRoster([
  { name: "A", monthlyListeners: 1, role: "featured" },
]);
assert(!noPrimary.valid, "rejects zero primaries");

const twoPrimary = validateReleaseRoster([
  { name: "A", monthlyListeners: 1, role: "primary" },
  { name: "B", monthlyListeners: 2, role: "primary" },
]);
assert(!twoPrimary.valid, "rejects two primaries");

const tooMany = validateReleaseRoster([
  { name: "A", monthlyListeners: 1, role: "primary" },
  { name: "B", monthlyListeners: "", role: "featured" },
  { name: "C", monthlyListeners: "", role: "collaborator" },
  { name: "D", monthlyListeners: "", role: "remixer" },
  { name: "E", monthlyListeners: "", role: "original" },
]);
assert(!tooMany.valid, "rejects more than 4");

const primaryNeedsMl = validateReleaseRoster([
  { name: "A", monthlyListeners: "", role: "primary" },
]);
assert(!primaryNeedsMl.valid, "primary ML required");

const secondaryMlOptional = validateReleaseRoster([
  { name: "A", monthlyListeners: 10, role: "primary" },
  { name: "B", monthlyListeners: "", role: "remixer" },
]);
assert(secondaryMlOptional.valid, "secondary ML optional");
assert(secondaryMlOptional.rows?.[1]?.monthly_listeners === null, "blank ML is null");

const empty = validateReleaseRoster([{ name: "", monthlyListeners: "", role: "" }]);
assert(!empty.valid, "rejects empty roster");

console.log("validate-release-roster: ok");
