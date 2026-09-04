import Fastify, { type FastifyInstance } from "fastify";

const MAX_DELAY_MS = 30_000;

function parseStatus(value: string): number {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : 400;
}

export function buildReceiver(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
  });
  const sequences = new Map<string, number>();

  app.get("/health", async () => ({ status: "ok" }));

  app.all("/receive/success", async (request) => ({
    accepted: true,
    webhookId: request.headers["webhook-id"] ?? null,
  }));

  app.all<{ Params: { code: string } }>(
    "/receive/status/:code",
    async (request, reply) =>
      reply
        .code(parseStatus(request.params.code))
        .send({ configuredStatus: parseStatus(request.params.code) }),
  );

  app.all<{ Params: { milliseconds: string } }>(
    "/receive/delay/:milliseconds",
    async (request) => {
      const requested = Number(request.params.milliseconds);
      const delay = Number.isFinite(requested)
        ? Math.min(Math.max(requested, 0), MAX_DELAY_MS)
        : 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return { delayedByMs: delay };
    },
  );

  app.all("/receive/terminate", async (request) => {
    request.raw.socket.destroy();
  });

  app.all<{
    Params: { name: string };
    Querystring: { statuses?: string };
  }>("/receive/sequence/:name", async (request, reply) => {
    const statuses = (request.query.statuses ?? "500,200")
      .split(",")
      .map(parseStatus);
    const currentIndex = sequences.get(request.params.name) ?? 0;
    const selected =
      statuses[Math.min(currentIndex, statuses.length - 1)] ?? 500;
    sequences.set(request.params.name, currentIndex + 1);
    return reply.code(selected).send({
      attempt: currentIndex + 1,
      configuredStatus: selected,
      sequence: request.params.name,
    });
  });

  app.post<{ Params: { name: string } }>(
    "/receive/sequence/:name/reset",
    async (request) => {
      sequences.delete(request.params.name);
      return { reset: true, sequence: request.params.name };
    },
  );

  return app;
}
