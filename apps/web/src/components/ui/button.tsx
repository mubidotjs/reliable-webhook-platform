import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, variant = "primary", ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50",
          variant === "primary" &&
            "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
          variant === "secondary" &&
            "border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500 hover:bg-slate-800",
          variant === "ghost" &&
            "text-slate-300 hover:bg-slate-900 hover:text-white",
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
