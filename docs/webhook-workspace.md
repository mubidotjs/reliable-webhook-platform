# Add and verify your webhook

After signing in at https://webhooks.mubashirhussain.dev, use the workspace navigation.

## 1. Prepare a receiving service

Your receiver is a public HTTPS POST endpoint you control, for example
https://your-service.example/webhooks. It is not the QStash API URL, and the
workspace domain is not automatically a receiving endpoint.

The repository includes a tested Node.js 24 example in
[verified-example.ts](../apps/receiver/src/verified-example.ts).
It validates HMAC signatures before accepting events and records event IDs in
SQLite to deduplicate deliveries across restarts. Its example business action is
recording receipt; when adding real business updates, commit those updates and
deduplication together.

Expose port 4001 through your own HTTPS reverse proxy. Production endpoints must
use public HTTPS on port 443; localhost and private addresses are rejected.

## 2. Register the endpoint

Open **Endpoints**, enter the receiver URL, and click **Create endpoint**.
Copy the one-time signing secret into the receiver's WEBHOOK_SIGNING_SECRET
environment variable. Do not store it in frontend code.

Run the example with:

```sh
pnpm --filter @rwp/receiver dev:verified
```

Optional environment variables: PORT (default 4001) and RECEIPTS_DB (default
receipts.sqlite in the receiver working directory). Protect the receipt database
and keep it on persistent storage. This example uses one process and one signing
key; a deployed service with rotating keys must retain old verification keys
until pinned in-flight deliveries have finished.

The dashboard never shows stored secrets again. If you lose a secret, use
**Rotate secret** on endpoint details, then update your receiver.

## 3. Verify the signature

The complete example performs these checks:

- Validate webhook-id, webhook-timestamp, and webhook-signature.
- Reject timestamps more than five minutes from the receiver's current time.
- Remove whsec_ and base64url-decode the 32-byte signing key.
- Compute HMAC-SHA256 over `eventId.timestamp.rawBody`.
- Compare `v1=<base64url digest>` in constant time.
- Deduplicate the event ID durably before returning 2xx.

Read the body as bytes, before JSON parsing. Parsing and reserializing can change
the bytes and invalidate the signature. See [signing.md](signing.md) for the
deterministic signature vector.

## 4. Send an event

Open **Events**, choose the endpoint, enter a type such as test.webhook, and
supply a small synthetic JSON payload. Leave Event ID blank to generate one.

Click **Send event**. The delivery detail page shows the accepted event and
refreshes every three seconds while active and visible. A lost submission
response shows **Retry same event**, preserving the ID and exact submitted
content. Use **Start a new event** only when you intend another logical event.

## 5. Read the result

- **PENDING:** accepted, waiting for dispatch. Persistent pending work requires
  checking the local worker or hosted queue setup; it does not prove queue health.
- **PROCESSING:** an attempt has started.
- **RETRY SCHEDULED:** a transient failure will retry at the displayed time.
- **SUCCEEDED:** the receiver returned an HTTP 2xx response.
- **EXHAUSTED:** permanent failure, five-attempt limit, or 24-hour deadline.
- **CANCELLED:** the endpoint was disabled before another attempt.

Attempt history includes timestamps, destination, duration, HTTP result, failure
classification, and the resulting delivery state. **UNCERTAIN** means the worker
stopped without a definitive saved outcome; the receiver may have received it.

A successful HTTP response does not prove that a receiver validated the
signature. Confirm that with the receiver's logs or durable receipt. The example
only returns 200 after verification and receipt recording.

## Common setup problems

Malformed JSON, a reused ID with changed content, disabled endpoints, unsafe
URLs, and daily acceptance quotas are shown as actionable form errors.
Workspace quota is 25 accepted events per UTC day; global quota is 100.
Endpoint URL changes and rotation affect future deliveries only.
The effective M2 timeout is five seconds.

For hosted queue configuration and recovery scheduling, use [the M2
runbook](m2-delivery.md). The user-facing guide is available under **Setup guide**
in the workspace.
