import { createVerifiedReceiver } from "./verified-example";
const secret = process.env.WEBHOOK_SIGNING_SECRET;
if (!secret)
  throw new Error(
    "Set WEBHOOK_SIGNING_SECRET to the secret shown when creating your endpoint.",
  );
const receiver = createVerifiedReceiver(
  secret,
  process.env.RECEIPTS_DB ?? "receipts.sqlite",
);
receiver.server.listen(Number(process.env.PORT ?? 4001), "127.0.0.1", () => {
  console.info(
    "Verified receiver listening on /webhooks. Expose it through your own HTTPS reverse proxy.",
  );
});
process.on("SIGTERM", () =>
  receiver.server.close(() => receiver.closeDatabase()),
);
process.on("SIGINT", () =>
  receiver.server.close(() => receiver.closeDatabase()),
);
