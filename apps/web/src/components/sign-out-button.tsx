"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton(): React.ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut(): Promise<void> {
    setPending(true);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/");
            router.refresh();
          },
        },
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="secondary" onClick={signOut} disabled={pending}>
      <LogOut aria-hidden="true" className="size-4" />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
