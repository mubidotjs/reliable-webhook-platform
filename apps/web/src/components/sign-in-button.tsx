"use client";

import { Github } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInButton(): React.ReactNode {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function signIn(): Promise<void> {
    setPending(true);
    setError(false);
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
      });
      if (result.error) setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <Button onClick={signIn} disabled={pending}>
        <Github aria-hidden="true" className="size-4" />
        {pending ? "Connecting…" : "Continue with GitHub"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          Unable to sign in with GitHub. Please try again.
        </p>
      )}
    </div>
  );
}
