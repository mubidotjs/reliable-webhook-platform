-- Supports recovery's correlated NOT EXISTS and generation-scoped consumption.
CREATE INDEX outbox_aggregate_generation_status_idx ON outbox_messages ("aggregateId", topic, generation, status);
