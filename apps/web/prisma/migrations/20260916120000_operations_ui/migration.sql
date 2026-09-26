ALTER TABLE webhook_endpoints ADD COLUMN name TEXT;
ALTER TABLE webhook_endpoints ADD CONSTRAINT endpoint_name_length CHECK (name IS NULL OR char_length(name) <= 100);
DROP INDEX deliveries_event_endpoint_key;
-- Keep deliveries_one_primary_per_event_key and immutable history triggers.
CREATE INDEX deliveries_eventId_endpointId_idx ON deliveries ("eventId", "endpointId");
CREATE INDEX deliveries_workspaceId_status_createdAt_id_idx ON deliveries ("workspaceId", status, "createdAt", id);
CREATE INDEX deliveries_workspaceId_endpointId_createdAt_id_idx ON deliveries ("workspaceId", "endpointId", "createdAt", id);
