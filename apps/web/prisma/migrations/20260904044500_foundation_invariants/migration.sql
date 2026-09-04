-- PostgreSQL treats NULL values as distinct in ordinary unique indexes. This
-- partial index makes the global (workspace-less) quota bucket atomic as well.
CREATE UNIQUE INDEX "quota_buckets_global_subject_bucketStart_key"
ON "quota_buckets"("subject", "bucketStart")
WHERE "workspaceId" IS NULL;

-- Each event has one original delivery. Replays retain the event relationship
-- but are identified by a non-null replay parent.
CREATE UNIQUE INDEX "deliveries_one_primary_per_event_key"
ON "deliveries"("eventId")
WHERE "replayOfId" IS NULL;

-- Persist the product's bounded values as database invariants in addition to
-- validating them at the API boundary.
ALTER TABLE "webhook_endpoints"
ADD CONSTRAINT "webhook_endpoints_timeout_range_check"
CHECK ("timeoutMs" BETWEEN 1000 AND 15000),
ADD CONSTRAINT "webhook_endpoints_secret_version_check"
CHECK ("currentSecretVersion" > 0);

ALTER TABLE "endpoint_secrets"
ADD CONSTRAINT "endpoint_secrets_version_check"
CHECK ("version" > 0);

ALTER TABLE "api_keys"
ADD CONSTRAINT "api_keys_scopes_not_empty_check"
CHECK (cardinality("scopes") > 0);

ALTER TABLE "deliveries"
ADD CONSTRAINT "deliveries_timeout_range_check"
CHECK ("timeoutMs" BETWEEN 1000 AND 15000),
ADD CONSTRAINT "deliveries_attempt_count_check"
CHECK ("attemptCount" BETWEEN 0 AND 5);

ALTER TABLE "delivery_attempts"
ADD CONSTRAINT "delivery_attempts_sequence_check"
CHECK ("sequence" BETWEEN 1 AND 5),
ADD CONSTRAINT "delivery_attempts_duration_check"
CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
ADD CONSTRAINT "delivery_attempts_response_excerpt_check"
CHECK ("responseExcerpt" IS NULL OR octet_length("responseExcerpt") <= 4096);

ALTER TABLE "outbox_messages"
ADD CONSTRAINT "outbox_messages_publish_count_check"
CHECK ("publishCount" >= 0);

ALTER TABLE "quota_buckets"
ADD CONSTRAINT "quota_buckets_count_check"
CHECK ("count" >= 0);

ALTER TABLE "metric_aggregates"
ADD CONSTRAINT "metric_aggregates_values_check"
CHECK ("count" >= 0 AND "total" >= 0);
