"use client";
import { useRef, useState, type ReactNode } from "react";
export function FormDisclosure({
  title,
  initiallyOpen,
  children,
}: {
  title: string;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={ref}
      open={open}
      className="section-disclosure mb-6"
      onToggle={(event) => {
        if (
          !event.currentTarget.open &&
          event.currentTarget.querySelector("[data-secret], [aria-busy=true]")
        ) {
          event.currentTarget.open = true;
          setOpen(true);
        } else setOpen(event.currentTarget.open);
      }}
    >
      <summary
        onClick={(event) => {
          if (
            open &&
            ref.current?.querySelector("[data-secret], [aria-busy=true]")
          )
            event.preventDefault();
        }}
      >
        {title}
      </summary>
      {children}
    </details>
  );
}
