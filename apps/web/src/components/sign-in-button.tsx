"use client";

import { Github } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInButton(): React.ReactNode {
  const [pending, setPending] = useState(false);

  async function signIn(): Promise<void> {
    setPending(true);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={signIn} disabled={pending}>
      <Github aria-hidden="true" className="size-4" />
      {pending ? "Connecting…" : "Continue with GitHub"}
    </Button>
  );
}
