# M2 durable delivery

## Acceptance and contracts

POST /api/events accepts a Better Auth session and the exact application Origin.
The body is `{ eventId?, endpointId, type, payload }`, limited to 256 KiB.
The workspace comes from the credential. There is no API-key authentication in M2.

A 202 response contains `data.eventId`, `data.deliveryId`, and the current
delivery status. Acceptance means that event, delivery, quota, audit, and outbox
work committed together. Identical producer IDs within one workspace return the
same delivery; different content returns 409. Producer IDs in different
workspaces are independent. JSON object key ordering does not change identity.

The immutable delivery body is serialized once as
`{ eventId, type, createdAt, payload }`. Delivery signs its exact UTF-8 bytes with
M1's `eventId.timestamp.rawBody` contract, not a newly serialized object.
The destination URL and secret version are pinned. M2 always uses a five-second
deadline, regardless of the endpoint-management timeout field. Disabling an
endpoint cancels remaining work before its next request; an in-flight request may finish.

## Worker and recovery

Set DATABASE_URL and DIRECT_URL, apply `pnpm db:deploy`, then run:

```sh
pnpm --filter @rwp/web worker
```

The default local adapter consumes PostgreSQL outbox work. Start the worker again
after stopping it; no manual rescheduling is required. The polling interval only
wakes the worker. All due times and leases are persisted.

For hosted operation set QUEUE_ADAPTER=qstash, APP_URL to the public application
origin, QSTASH_URL to the account's QStash region API, and all three QStash
credentials shown in .env.example. Retain encryption keys for pinned secrets.
After deploying M2 and applying its migration, run:

```sh
pnpm --filter @rwp/web queue:setup
```

This idempotently configures a five-minute QStash recovery schedule.
Processor and recovery routes require valid QStash signatures. The local adapter
calls the service directly and does not enable unsigned HTTP callbacks.
QStash provider delivery retries are zero. Application retries are committed
with their next outbox record and published using an absolute not-before time.

Recovery reclaims expired 30-second leases, republishes overdue unconsumed work
after five minutes, reconstructs missing scheduling work, and terminalizes expired
deliveries. Publication attempts have a ten-second caller deadline. A provider
request that completes after that deadline can create a duplicate, which the
database state machine safely ignores. Publication failures do not spend an
outbound attempt.

There are at most five attempts and a 24-hour window from acceptance.
Equal-jitter delays start between 15 and 30 seconds and double, capped at one hour.
408, 425, 429, network failures, timeouts, and 5xx except 501/505 retry.
429/503 Retry-After is respected up to one hour. Other HTTP failures exhaust.
Unknown crash outcomes consume an attempt; retries never extend the deadline.

A published message is not evidence of delivery. Recovery needs the database,
application, and scheduler to eventually become available. When the 24-hour
window expires during an outage, the next recovery run records EXHAUSTED.
At-least-once delivery allows duplicates after a destination receives a request
but before the worker records success. Consumers deduplicate webhook-id.

The acceptance limits are 100 globally and 25 per workspace per UTC day.
QStash publication attempts are limited to 650 per UTC day, separate from the
288 scheduled recovery calls. An uncertain publication still consumes budget.
Budget-blocked work remains durable and is either dispatched later or explicitly
exhausted at its deadline. No exactly-once guarantee is made.

## Auditing

delivery_attempts stores immutable attempt starts; delivery_attempt_outcomes
stores one immutable completion per attempt. Historical legacy columns on the
start table are retained for migration compatibility; use the outcome join for
M2 results. A STARTED row without an outcome is active or awaiting recovery.
UNCERTAIN means the destination outcome is unknown. Bodies and credentials are
never captured in response metadata or lifecycle logs.

```sql
SELECT e."producerEventId", d.id AS "deliveryId", d.status, d."attemptCount",
       a.id AS "attemptId", a.sequence, a."startedAt", a."destinationUrl",
       o."completedAt", o.status AS "attemptStatus", o."httpStatus",
       o."errorClass", o."resultingState"
FROM events e
JOIN deliveries d ON d."eventId" = e.id
LEFT JOIN delivery_attempts a ON a."deliveryId" = d.id
LEFT JOIN delivery_attempt_outcomes o ON o."attemptId" = a.id
ORDER BY e."createdAt", a.sequence;
```

Response bodies are omitted; outcome metadata is allowlisted and bounded.
Do not export destination URLs without checking their query strings for secrets.

## Reproducible evidence

Use a fresh isolated local PostgreSQL database, set DATABASE_URL and DIRECT_URL,
apply migrations, then:

```sh
pnpm test:integration
pnpm --filter @rwp/web demo:m2
```

The demo uses an explicitly injected loopback transport, verifies outbound HMAC,
injects a publication outage, receives 500, exits the worker, and receives 200
from a fresh worker. It submits a duplicate event and invokes a completed delivery
again, then saves sanitized history to docs/reviews/m2-local-evidence.json.
It leaves synthetic records for SQL inspection. It does not claim a live QStash
test or weaken production HTTPS/SSRF controls.

Integration tests additionally kill real worker subprocesses after claiming work
and after the receiver responds, then verify UNCERTAIN history and recovery.

For live proof, deploy M2 at https://webhooks.mubashirhussain.dev, configure the
signed recovery schedule, and register a controlled public HTTPS receiver with
a named 500,200 response sequence. While signed in, submit through /api/events
with a unique eventId; save the response and SQL history. Stop/restart the local
worker in a local run or restart the deployed process between attempts.
Temporarily make publishing unavailable in an isolated demo deployment and
restore it; confirm the schedule drains the durable outbox without a new event.
Replay a valid signed callback within its validity window and confirm no
additional send for a completed generation.

M2 portfolio completion requires this live QStash proof in addition to the local
evidence. A local harness alone is not the hosted milestone sign-off.
