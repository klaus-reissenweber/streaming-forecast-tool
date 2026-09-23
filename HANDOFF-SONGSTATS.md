# Songstats handoff

Raw fetch only through `lib/songstats/client.ts`. Every response is inserted into `songstats_snapshots` before parse. Parsers throw the failing path; no fallbacks. Never write `daily_data.streams`. Do not call the network from tests (saved files under `analysis/songstats-probe/`). Do not touch `lib/forecast.ts`, the ad layer, or model code.

Spotify cumulative on `tracks/stats` is `body.stats[i].data.streams_total` where `source === "spotify"`. `deriveDailyGrid` uses `SPOTIFY_COUNT_THROUGH_OFFSET_DAYS` (currently `1`, provisional). Cron: `GET /api/cron/songstats-totals` (`vercel.json` schedule `0 6,14,22 * * *`) for `status = active`, ISRC set, `release_date` in today−30 … today+2.

## Paired period

compare-grid only means something on a release that is being typed by hand while the cron is writing Songstats totals.

- **Paired active releases:** none. On 2026-09-22 the five rows still marked `active` are all past day 28 (days 82–141). The cron window 2026-08-23 … 2026-09-24 is empty. Nothing in-window to pair.
- **Cron go-live date:** 2026-09-22 (code and schedule are in the repo; not deployed or triggered in the go-live prep task).
- After the first seven days of a real paired run, execute `npx tsx --env-file=.env.local scripts/compare-grid.ts <release_id>` and read both offset-1 and offset-2 tables. Set `SPOTIFY_COUNT_THROUGH_OFFSET_DAYS` from that evidence.
- Closed releases are excluded because the cron does not fetch them. That includes Bob Moses Last Forever (`6d761fa4-d938-4a94-84d8-73953432b604`).
