import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
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
          "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
          variant === "primary" && "bg-accent text-canvas hover:bg-cyan-200",
          variant === "secondary" &&
            "border border-control bg-surface text-foreground hover:bg-raised",
          variant === "ghost" &&
            "text-muted hover:bg-raised hover:text-foreground",
          variant === "destructive" &&
            "border border-rose-300/50 bg-rose-300/10 text-rose-200 hover:bg-rose-300/20",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
