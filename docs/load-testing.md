# Reproducible load testing

The lightweight harness uses existing services, PostgreSQL, the local queue and real signed loopback HTTP. It mixes 90% immediate successes with 10% initial 500s, drains concurrent deliveries and reads all history with deterministic cursors. Retry time uses an injected clock; production SSRF policy stays intact.

Use an empty, dedicated loopback database whose name ends in `_m4`, with all migrations applied. The harness refuses other targets. Export its DATABASE_URL and DIRECT_URL, then:

```sh
NODE_ENV=test LOG_LEVEL=error DAILY_TENANT_DELIVERY_LIMIT=2000 DAILY_GLOBAL_DELIVERY_LIMIT=2000 pnpm --filter @rwp/web test:load 1000 8
```

PowerShell:

```powershell
$env:NODE_ENV='test'
$env:LOG_LEVEL='error'
$env:DAILY_TENANT_DELIVERY_LIMIT='2000'
$env:DAILY_GLOBAL_DELIVERY_LIMIT='2000'
pnpm --filter @rwp/web test:load 1000 8
```

It deletes only its own synthetic owner/data and restores its global acceptance counter. Aggregate evidence remains. Restore environment overrides before regression tests; never run concurrently with quota-sensitive integration tests.

Output includes correctness counts, ingestion p95, history-page p95, worker elapsed time and EXPLAIN ANALYZE for the recovery index lookup. Every accepted delivery must succeed and each history row must appear once; violations exit nonzero. Timings are measurements, not universal SLOs.

## Scope and limitations

Ingestion is measured at the service boundary, excluding HTTP/authentication and request-rate middleware. Real signed HTTP uses an injected loopback transport; it is not a DNS/TLS or QStash throughput benchmark. Route integration and Playwright cover those application boundaries. Global acceptance locks and hourly metric rows intentionally serialize some operations; this workload does not prove horizontal scalability.

## Results

See [M4 acceptance evidence](reviews/m4-v1-hardening.md) for actual measured results and query-plan findings. No benchmark result should be assumed until recorded there.

The measured 1,000-event run completed with 1,000 successful deliveries, 1,100 attempts and 1,000 unique history rows. Service ingestion took 43.752 seconds (p95 494.88 ms); worker execution took 34.286 seconds; history-page p95 was 22.01 ms. PostgreSQL used the new recovery lookup index (0.086 ms execution for the sampled lookup).

These measurements came from Windows x64, Node 24.19.0, PostgreSQL 17 in Docker, an i7-6600U with four logical CPUs and 16 GiB RAM. Other local verification work was active. See [sanitized machine-readable evidence](reviews/m4-load-evidence.json). Acceptance locking is a likely ingestion contention point by inspection; this run did not measure lock wait attribution, so it is not a proven bottleneck diagnosis.
