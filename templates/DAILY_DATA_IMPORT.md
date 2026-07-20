# Daily data import — instructions for Noah

## Day-number convention (required)

- **Day 1 = the release date** (the day the track is live on all platforms).
- **Fold the timezone sliver into day 1.** Spotify often shows a small stream/save count on the calendar day *before* release. Add that into day 1. **Do not use day 0.**
- Days then run **1–28** from the release date.

## CSV format

Use the template: `templates/daily-data-import-template.csv`

```text
day,streams,saves
1,28871,4379
2,129399,6300
…
```

- Header row is optional.
- `day` column is optional: if omitted, rows are numbered 1, 2, 3… in paste order (first data row = day 1 = release date).
- Streams and saves must be whole numbers ≥ 0.
- One row per day; no duplicate day numbers.

## In the app

On the release page → **Import from spreadsheet** → paste or upload → **Apply to this release**.

The importer rejects day 0 and any day outside 1–28.
