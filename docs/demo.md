# Portfolio demonstration

Use synthetic data and an isolated database. The UI always reads persisted records; do not change production retry timing for a demonstration.

## Retry and restart proof

```sh
pnpm --filter @rwp/web demo:m2
```

The existing harness creates an endpoint/event, simulates publication failure, sends signed HTTP to a loopback receiver returning 500, exits its worker, then starts a fresh worker for the persisted retry returning 200. It verifies duplicate ingestion/callback safety and saves sanitized `docs/reviews/m2-local-evidence.json`. Use a fresh local database; synthetic records remain for inspection. This is local queue proof, not hosted QStash proof.

`pnpm test:integration` also kills workers after claim and after destination receipt, then verifies UNCERTAIN outcomes, fencing and recovery.

## Exhaustion and replay in the UI

Follow [M3 fixture setup](m3-operations.md#local-demonstration): stop background workers and use the inert test queue configuration in a local development app.

```sh
pnpm --filter @rwp/web demo:m3 seed <signed-in-owner-email>
```

1. Open Deliveries and inspect the 500 → 500 → 200 example with its timings.
2. Filter Exhausted; inspect all five failed attempts and the terminal reason.
3. Select Replay, review current endpoint configuration and confirm once.
4. Copy the new delivery ID and run `pnpm --filter @rwp/web demo:m3 succeed <new-delivery-id>`.
5. Show new-delivery success alongside the unchanged original failure history.

This fixture uses injected outcomes and accelerated time. Playwright verifies the actual replay UI and persisted records. Pair it with the real-HTTP subprocess proof, and describe the simulation honestly.

## Hosted demonstration

Use a controlled HTTPS development receiver with the real QStash adapter. Failure fixtures include `/receive/status/500`, `/receive/status/429`, `/receive/delay/6000`, `/receive/terminate`, and `/receive/sequence/<unique-name>?statuses=500,500,200` (also `timeout,200`). They reject production mode and bind loopback by default. Explicit network exposure is only for an isolated development receiver, separate from the application; use `verified-server.ts` for the consumer verification example.

Create an endpoint, submit from Events, and observe Retry scheduled → Succeeded. For replay, exhaust a status/500 endpoint, edit to a working URL and replay. Keep normal retry timings. Capture revision, delivery IDs, sanitized logs and UI history using the [production checklist](m4-operations.md#production-smoke-checklist).
