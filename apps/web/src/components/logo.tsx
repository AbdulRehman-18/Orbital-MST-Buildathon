import { cn } from "@/lib/utils";

/** Namma Seva mark: a saffron block (a verified record) linked to a teal block (the citizen). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="8" className="fill-primary" />
      <path
        d="M9 20.5 14 25l9-11"
        fill="none"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
      <circle cx="23" cy="9" r="3" className="fill-civic" />
    </svg>
  );
}
