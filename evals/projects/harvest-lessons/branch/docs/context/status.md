# Status

## Done

- Receive, verify, store (PR #1–#3)
- Delivery with retries (PR #4)
- Delivery hardening (this branch, PR #12)

## Open

- Replay by id (not started)

## This branch

- **The 3% of rejected webhooks:** the handler decoded the JSON and verified the
  signature over `json.Marshal` of the decoded value. Re-encoding reorders keys
  and drops whitespace, so the bytes differed from what the sender signed
  whenever the sender's encoding wasn't Go's. Fixed: read the raw body once,
  verify the HMAC over those exact bytes, then decode. Store the raw bytes too.
- **SQLITE_BUSY under load:** with four delivery workers writing status updates,
  about one write in fifty failed with SQLITE_BUSY. Fixed with
  `_busy_timeout=5000` in the DSN.
- **First retry fired immediately:** `deliveries.attempt` starts at 1 (the
  column default), but `Backoff` assumed 0-based attempts, so the first wait
  was 2s instead of 1s and the cap was reached one attempt early. Fixed in
  `Backoff`.
- **A delivery worker hung for hours:** a consumer accepted the connection and
  never answered. Go's default `http.Client` has no timeout. Fixed: 10s timeout.
- **Pending-deliveries query:** added the index on `deliveries.status`
  (`migrations/002`). The full-table scan is gone.
- Fixed a typo in the README.
