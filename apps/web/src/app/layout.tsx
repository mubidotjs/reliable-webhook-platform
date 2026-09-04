import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Reliable Webhook Platform",
    template: "%s · Reliable Webhook Platform",
  },
  description:
    "Inspect durable webhook delivery, attempts, failures, and safe replays.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
