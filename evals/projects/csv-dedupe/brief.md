# Brief — csv-dedupe

## Pitch

I export contacts from three CRMs every quarter and need a one-off script that
merges the CSVs and drops duplicates by email before I import them into the new
system. I'll run it once, maybe twice.

## Answers

- **Problem:** three CSV exports overlap; duplicates by email (case-insensitive) need dropping, keeping the most recently updated row.
- **Users:** just me.
- **Core flows:** run the script on a folder of CSVs; get one merged CSV out. Acceptance: the output has one row per email and the newest `updated_at` wins.
- **Constraints:** no budget, I know Python, needed this week. No compliance concerns beyond not uploading the data anywhere.
- **Surfaces:** a command-line script. No UI.
- **Size:** throwaway — it's a one-off.

## Approvals

Approve every phase.
