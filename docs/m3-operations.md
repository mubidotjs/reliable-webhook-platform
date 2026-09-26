# M3 — Operations UI

The authenticated workspace provides delivery history at `/dashboard/deliveries`
and complete lifecycle details at `/dashboard/deliveries/:id`.

## History and inspection

History supports server-side status, endpoint ID, event type, creation-date range,
and exact delivery/event ID search. Event search accepts both the internal event
record ID and the producer's event ID. Filters remain in the URL and survive
pagination and navigation back from details. Pages default to 25 rows, with a
maximum of 100; cursors order by creation time and ID descending.

The list includes the most recent attempt only. Details load the event payload,
endpoint, and every attempt in sequence order. Payload JSON is escaped text in a
bounded scrolling viewer. HTTP status, duration, and persisted failure classes
explain destination failures. Generic network errors are not presented as a
specific DNS diagnosis. Response bodies are not retained.

Times use explicit UTC, matching the rest of the dashboard. Date filters include
the entire selected UTC day. Endpoint names are optional; existing unnamed
endpoints use the hostname. Renaming an endpoint does not change delivery history.

## States and refresh

- **Pending:** durably accepted, awaiting dispatch.
- **Processing:** an outbound attempt is in progress.
- **Retry scheduled:** the backend has scheduled the next attempt.
- **Succeeded:** the destination returned a successful response.
- **Exhausted:** the retry policy ended, including permanent failures.
- **Cancelled:** delivery was cancelled, for example because an endpoint was disabled.

Active views refresh every three seconds while visible. Polling stops when all
displayed deliveries are terminal. Manual refresh remains available. The existing
five-attempt, five-second timeout and 24-hour retry window remain authoritative.

## Replay

Replay is available for succeeded, exhausted, and cancelled deliveries when the
endpoint is enabled. Confirmation shows the current destination and explains
that the event will be sent again. Receivers may deduplicate the unchanged event
ID; replay does not imply exactly-once processing at the receiver.

Replay creates a new delivery linked through `replayOfId`, using the immutable
original event body and the endpoint's current destination and signing version.
The original delivery and attempt history remain unchanged. Configuration is
checked again inside the transaction; a change requires another confirmation.
After acceptance the browser opens the new delivery, which shows its parent link.

The new delivery, quota consumption, audit event, idempotency record and durable
outbox message commit atomically. Replays use the same processor and recovery
pipeline as ingestion, and consume the same daily acceptance quotas.

## API and tenant isolation

All routes require the existing workspace session. Workspace ownership comes
from that session, never a browser-supplied tenant ID. Foreign records return 404.
Responses explicitly select operational fields and omit signing secrets,
encryption material, queue credentials and internal claim tokens.

| Route                             | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `GET /api/deliveries`             | Cursor-paginated history                                    |
| `GET /api/deliveries/:id`         | Delivery, event, endpoint, attempts, and replay eligibility |
| `POST /api/deliveries/:id/replay` | Create or recover an idempotent replay                      |

List parameters: `status`, `endpointId`, `eventType`, `from`, `to`, `search`,
`cursor`, `limit`. API dates are ISO timestamps with offsets.

Replay requires a trusted `Origin`, an `Idempotency-Key` header, and
`{"endpointRevision":"<revision from the detail response>"}`.
It returns HTTP 202 with `{"data":{"deliveryId":"..."}}`.
Retain the same key when retrying an uncertain request. Within 24 hours repeated
requests return the same delivery, including after the endpoint is disabled.
Reusing a key for a different source delivery returns 409. A new key represents
a separate intentional replay; an expired key may create another delivery.

Structured replay logs and audit records contain identifiers, never event
payloads or signing credentials. Normal view polling does not create audit noise.
See the generated OpenAPI document for contracts and error responses.

## Local demonstration

Use an isolated local PostgreSQL database and the normal development encryption
configuration. Migrate and generate the client before starting the app. Sign in
and create a workspace, then run:

```sh
pnpm --filter @rwp/web demo:m3 seed <signed-in-owner-email>
```

For a fully controlled walkthrough, stop background delivery workers and start
the dashboard with the inert local queue configuration used in
`playwright.config.ts` (QStash URL `http://127.0.0.1:9` and synthetic test
credentials). The fixture then owns dispatch; do not use that configuration in
production.

This creates synthetic events for `500 → 500 → 200`,
`timeout → 200`, and five failing attempts ending in **Exhausted**.
The script consumes persisted outbox jobs through the real processor with
controlled time and an injected transport. It makes no destination requests and
does not alter production network policy. It rejects production mode and
non-local database hosts.

Filter **Exhausted**, open the delivery, inspect its attempts, and replay it.
To drive the synthetic replay to success without an external queue, run:

```sh
pnpm --filter @rwp/web demo:m3 succeed <new-delivery-id>
```

The worker only accepts events with the synthetic `demo.m3.` type prefix.
The UI always reads persisted data; it contains no synthetic-data branch.
The automated Playwright walkthrough uses a dedicated authenticated fixture owner.

## Migration and verification

Deploy migrations before the application. The M3 migration adds optional endpoint
names and list indexes, removes the blanket event/endpoint delivery uniqueness
index, and preserves the partial index allowing exactly one original delivery
per event. Immutable event, attempt and outcome protections remain in place.
Do not restore the old blanket unique index after replays exist.

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:integration`, `pnpm openapi:check`, `pnpm build` and
`pnpm test:e2e`. Database-backed tests require a migrated local database.
Coverage includes concurrent replay, rollback, quotas, tenant isolation,
configuration changes, ingestion deduplication after replay, and history
immutability. Playwright produces desktop and mobile walkthrough screenshots in
the ignored `test-results/` directory.
