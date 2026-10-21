# Status

## Done

- Receive, verify, store (PR #1–#3)
- Delivery with retries (PR #4)
- README typo (this branch, PR #13)

## Open

- `deliveries.status` has no index; the pending query scans the table.
- Some valid webhooks are rejected with 401 (about 3%); cause unknown.
