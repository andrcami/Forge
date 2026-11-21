# Architecture — relay

## Stack

- **Language:** Go 1.23
- **Datastore:** SQLite, through `modernc.org/sqlite`
- **Deployment:** one container on the team's VM

## Decisions

- One process: the receiver and the delivery workers share the SQLite file.
