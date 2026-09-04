import { buildReceiver } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const receiver = buildReceiver();

try {
  await receiver.listen({ host, port });
} catch (error) {
  receiver.log.error(error);
  process.exitCode = 1;
}
