# relay

Recieves webhooks, verifies their signatures, stores them in SQLite, and
delivers each one to the internal consumers with retries.

```bash
go run ./cmd/relay
go test ./...
```
