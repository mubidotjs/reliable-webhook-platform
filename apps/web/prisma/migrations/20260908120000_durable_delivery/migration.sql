ALTER TABLE events ADD COLUMN "producerEventId" TEXT, ADD COLUMN "requestHash" TEXT;
UPDATE events SET "producerEventId" = id, "requestHash" = 'legacy:' || id;
ALTER TABLE events ALTER COLUMN "producerEventId" SET NOT NULL, ALTER COLUMN "requestHash" SET NOT NULL;
CREATE UNIQUE INDEX events_workspace_producer_key ON events ("workspaceId", "producerEventId");
ALTER TABLE deliveries ADD COLUMN "claimToken" TEXT, ADD COLUMN generation INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "retryDeadline" TIMESTAMP(3), ADD COLUMN "terminalAt" TIMESTAMP(3), ADD COLUMN "lastError" TEXT;
UPDATE deliveries SET "retryDeadline" = "createdAt" + interval '24 hours',
 "terminalAt" = CASE WHEN status IN ('SUCCEEDED','EXHAUSTED','CANCELLED') THEN "updatedAt" END;
ALTER TABLE deliveries ALTER COLUMN "retryDeadline" SET NOT NULL;
-- M2 does not expose replay. Preserve historical duplicates rather than discard them:
-- fail migration explicitly if a previous deployment has created replay data.
CREATE UNIQUE INDEX deliveries_event_endpoint_key ON deliveries ("eventId", "endpointId");
CREATE INDEX deliveries_processing_lease_idx ON deliveries (status, "leaseExpiresAt");
ALTER TABLE delivery_attempts ADD COLUMN "destinationUrl" TEXT;
UPDATE delivery_attempts a SET "destinationUrl" = d."destinationUrl" FROM deliveries d WHERE a."deliveryId" = d.id;
ALTER TABLE delivery_attempts ALTER COLUMN "destinationUrl" SET NOT NULL;
CREATE TABLE delivery_attempt_outcomes (
 "attemptId" TEXT PRIMARY KEY REFERENCES delivery_attempts(id) ON DELETE CASCADE,
 status "AttemptStatus" NOT NULL, "completedAt" TIMESTAMP(3) NOT NULL,
 "httpStatus" INTEGER, "durationMs" INTEGER, "errorClass" TEXT,
 "responseMetadata" JSONB NOT NULL, "resultingState" "DeliveryStatus" NOT NULL,
 CONSTRAINT outcome_final CHECK (status != 'STARTED'),
 CONSTRAINT outcome_duration CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
 CONSTRAINT outcome_metadata_size CHECK (octet_length("responseMetadata"::text) <= 4096)
);
INSERT INTO delivery_attempt_outcomes
 SELECT a.id, a.status, COALESCE(a."completedAt", a."startedAt"), a."httpStatus",
 a."durationMs", a."errorClass", '{}'::jsonb,
 CASE WHEN a.status = 'SUCCEEDED' THEN 'SUCCEEDED'::"DeliveryStatus"
 WHEN a.sequence >= 5 THEN 'EXHAUSTED'::"DeliveryStatus" ELSE 'RETRY_SCHEDULED'::"DeliveryStatus" END
 FROM delivery_attempts a WHERE a.status != 'STARTED';
ALTER TABLE outbox_messages ADD COLUMN "claimToken" TEXT,
 ADD COLUMN generation INTEGER NOT NULL DEFAULT 1, ADD COLUMN "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "lastError" TEXT;
UPDATE outbox_messages SET "dueAt" = "availableAt";
CREATE INDEX outbox_messages_lease_idx ON outbox_messages (status, "leaseExpiresAt");
CREATE INDEX outbox_messages_due_idx ON outbox_messages (status, "dueAt");
CREATE FUNCTION reject_history_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Delivery history is append-only'; END $$;
CREATE TRIGGER immutable_attempt BEFORE UPDATE ON delivery_attempts
 FOR EACH ROW EXECUTE FUNCTION reject_history_update();
CREATE TRIGGER immutable_outcome BEFORE UPDATE ON delivery_attempt_outcomes
 FOR EACH ROW EXECUTE FUNCTION reject_history_update();
CREATE FUNCTION protect_event_body() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."deliveryBody" IS DISTINCT FROM OLD."deliveryBody" OR NEW.payload IS DISTINCT FROM OLD.payload
 OR NEW."producerEventId" IS DISTINCT FROM OLD."producerEventId" OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
 OR NEW.type IS DISTINCT FROM OLD.type OR NEW."endpointId" IS DISTINCT FROM OLD."endpointId"
 OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
 RAISE EXCEPTION 'Accepted event content is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_event BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION protect_event_body();
