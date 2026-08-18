/**
 * npx tsx scripts/validate-campaign-flights.ts
 */

import {
  clampFlightToWindow,
  flightsToChartBands,
  flightBandPlotStyle,
  isoDateToCampaignDay,
} from "../lib/campaign-flights";
import {
  campaignNameContainsUid,
  looksLikeCampaignUid,
  readableCampaignName,
} from "../lib/campaign-display-name";
import { activeNavItemId, adResultsHref, isPublicPath } from "../lib/nav";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(isoDateToCampaignDay("2026-08-01", "2026-08-01") === 1, "D1");
assert(isoDateToCampaignDay("2026-08-01", "2026-08-07") === 7, "D7");
assert(isoDateToCampaignDay("2026-08-01", "2026-07-31") === 0, "before window");

const clamped = clampFlightToWindow(-2, 40);
assert(clamped != null && clamped.startDay === 1 && clamped.endDay === 28, "clamp");
assert(clampFlightToWindow(30, 35) == null, "fully after window");

const bands = flightsToChartBands(
  [
    {
      id: "a",
      name: "Marquee",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
    },
    {
      id: "b",
      name: "Missing",
      startDate: null,
      endDate: "2026-08-10",
    },
  ],
  "2026-08-01",
);
assert(bands.length === 1, "skip incomplete");
assert(bands[0]!.startDay === 1 && bands[0]!.endDay === 2, "marquee days");

const plot = flightBandPlotStyle(1, 2);
assert(plot.left === "0%", "band starts at 0");

const uid = "4ca37558add91253fb3bac367e6011a5";
assert(looksLikeCampaignUid(uid), "hex hash is a uid");
assert(
  campaignNameContainsUid(`showcase · ${uid}`),
  "format · uid is unusable",
);
assert(looksLikeCampaignUid("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), "uuid is a uid");
assert(!looksLikeCampaignUid("Summer campaign"), "human name is not a uid");
assert(
  readableCampaignName({
    campaignName: null,
    campaignUid: uid,
    platform: "spotify",
    format: "showcase",
  }) === "Showcase",
  "spotify format fallback",
);
assert(
  readableCampaignName({
    campaignName: `showcase · ${uid}`,
    campaignUid: uid,
    platform: "spotify",
    format: "showcase",
  }) === "Showcase",
  "concatenated format · uid is not a display name",
);
assert(
  readableCampaignName({
    campaignName: uid,
    campaignUid: uid,
    platform: "meta",
    objective: "traffic",
  }) === "Meta traffic",
  "meta uid falls back to objective",
);
assert(
  readableCampaignName({
    campaignName: "Partner Probe",
    campaignUid: uid,
    platform: "spotify",
    format: "marquee",
  }) === "Partner Probe",
  "real name wins",
);
assert(
  readableCampaignName({
    campaignName: null,
    platform: "spotify",
    format: "marquee",
  }) === "Marquee",
  "marquee format",
);

const uidBand = flightsToChartBands(
  [
    {
      id: "uid-flight",
      name: uid,
      startDate: "2026-08-01",
      endDate: "2026-08-07",
    },
  ],
  "2026-08-01",
);
assert(uidBand[0]!.name === "Campaign", "chart band never shows a uid");

assert(isPublicPath("/report/abc") === true, "public report");
assert(isPublicPath("/reports") === false, "internal reports");
assert(isPublicPath("/login") === true, "login");
assert(activeNavItemId("/release/x/ad-upload") === "ad-results", "ad upload");
assert(activeNavItemId("/admin/retrain/approve/d") === "approve", "approve");
assert(
  adResultsHref("/release/abc-id") === "/release/abc-id/ad-upload",
  "contextual ads",
);

console.log("OK: campaign flights + nav");
