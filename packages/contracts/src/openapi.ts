import { createEventSchema, acceptedEventSchema } from "./events";
import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";

import {
  createEndpointResponseSchema,
  createEndpointSchema,
  endpointIdSchema,
  endpointListResponseSchema,
  endpointResponseSchema,
  rotateEndpointSecretResponseSchema,
  updateEndpointSchema,
} from "./endpoints";
import { cursorPageSchema, problemDetailsSchema } from "./shared";
import { z } from "./zod-openapi";

function response(schema: z.ZodType, description: string) {
  return {
    description,
    content: { "application/json": { schema } },
  };
}

function problem(description: string) {
  return {
    description,
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  };
}

export function createOpenApiDocument(): ReturnType<
  OpenApiGeneratorV31["generateDocument"]
> {
  const registry = new OpenAPIRegistry();
  registry.register("Endpoint", endpointResponseSchema.shape.data);
  registry.register("ProblemDetails", problemDetailsSchema);
  const sessionCookie = registry.registerComponent(
    "securitySchemes",
    "sessionCookie",
    {
      type: "apiKey",
      in: "cookie",
      name: "better-auth.session_token",
      description:
        "A Better Auth browser session cookie managed by the application.",
    },
  );
  const security = [{ [sessionCookie.name]: [] }];
  const idParams = z.object({
    id: endpointIdSchema.openapi({
      param: { name: "id", in: "path" },
      example: "cm123endpoint",
    }),
  });

  registry.registerPath({
    method: "post",
    path: "/v1/endpoints",
    summary: "Create a webhook endpoint",
    security,
    request: {
      headers: z.object({ origin: z.string().url() }),
      body: {
        content: { "application/json": { schema: createEndpointSchema } },
      },
    },
    responses: {
      201: response(
        createEndpointResponseSchema,
        "Endpoint created; secret shown once.",
      ),
      400: problem("Malformed JSON."),
      401: problem("Authentication required."),
      403: problem("Workspace or trusted origin required."),
      409: problem("Enabled endpoint limit reached."),
      422: problem("Invalid input or unsafe destination."),
      503: problem("Destination DNS resolution failed."),
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/endpoints",
    summary: "List webhook endpoints",
    security,
    request: { query: cursorPageSchema },
    responses: {
      200: response(
        endpointListResponseSchema,
        "A workspace-scoped endpoint page.",
      ),
      400: problem("Invalid pagination cursor or query."),
      401: problem("Authentication required."),
      403: problem("Workspace required."),
    },
  });
  registry.registerPath({
    method: "get",
    path: "/v1/endpoints/{id}",
    summary: "Read a webhook endpoint",
    security,
    request: { params: idParams },
    responses: {
      200: response(endpointResponseSchema, "The endpoint."),
      401: problem("Authentication required."),
      403: problem("Workspace required."),
      404: problem("Endpoint not found in the authenticated workspace."),
    },
  });
  registry.registerPath({
    method: "patch",
    path: "/v1/endpoints/{id}",
    summary: "Update or disable a webhook endpoint",
    security,
    request: {
      params: idParams,
      headers: z.object({ origin: z.string().url() }),
      body: {
        content: { "application/json": { schema: updateEndpointSchema } },
      },
    },
    responses: {
      200: response(endpointResponseSchema, "The updated endpoint."),
      400: problem("Malformed JSON."),
      401: problem("Authentication required."),
      403: problem("Workspace or trusted origin required."),
      404: problem("Endpoint not found in the authenticated workspace."),
      409: problem("A disabled endpoint cannot be edited."),
      422: problem("Invalid input or unsafe destination."),
      503: problem("Destination DNS resolution failed."),
    },
  });
  registry.registerPath({
    method: "post",
    path: "/v1/endpoints/{id}/rotate-secret",
    summary: "Rotate an endpoint signing secret",
    security,
    request: {
      params: idParams,
      headers: z.object({ origin: z.string().url() }),
    },
    responses: {
      201: response(
        rotateEndpointSecretResponseSchema,
        "Secret rotated; the new value is shown once.",
      ),
      401: problem("Authentication required."),
      403: problem("Workspace or trusted origin required."),
      404: problem("Endpoint not found in the authenticated workspace."),
      409: problem("A disabled endpoint cannot rotate secrets."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/events",
    summary: "Accept a durable webhook event",
    security,
    request: {
      headers: z.object({ origin: z.string().url() }),
      body: { content: { "application/json": { schema: createEventSchema } } },
    },
    responses: {
      202: response(
        acceptedEventSchema,
        "Durably accepted, or an identical event already exists.",
      ),
      400: problem("Malformed JSON."),
      401: problem("Authentication required."),
      403: problem("Workspace or trusted origin required."),
      404: problem("Endpoint not found."),
      409: problem("Conflicting event ID or disabled endpoint."),
      413: problem("Body exceeds 256 KiB."),
      422: problem("Invalid input."),
      429: problem("Daily acceptance quota reached."),
    },
  });
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Reliable Webhook Platform API",
      version: "1.0.0-m2",
      description:
        "Workspace-scoped endpoint management and durable event ingestion.",
    },
    servers: [{ url: "/", description: "Current origin" }],
  });
}
