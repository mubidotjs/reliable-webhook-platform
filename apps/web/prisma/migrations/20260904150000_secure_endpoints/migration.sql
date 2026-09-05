-- Support stable workspace-scoped cursor scans ordered by (createdAt, id).
CREATE INDEX "webhook_endpoints_workspaceId_createdAt_id_idx"
ON "webhook_endpoints"("workspaceId", "createdAt", "id");

-- Secret rotation must never leave more than one current secret for an endpoint.
CREATE UNIQUE INDEX "endpoint_secrets_one_active_per_endpoint_key"
ON "endpoint_secrets"("endpointId")
WHERE "retiredAt" IS NULL;
