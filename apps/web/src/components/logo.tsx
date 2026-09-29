import { cn } from "@/lib/utils";

/** Namma Seva mark: a block within a block — a hexagon outline sealing a solid core. Inherits `currentColor`. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 34 34" aria-hidden="true" className={cn("size-8", className)} fill="none">
      <path d="M17 2 31 9.5 31 24.5 17 32 3 24.5 3 9.5 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 10 24 13.9 24 21 17 24.9 10 21 10 13.9 Z" fill="currentColor" />
    </svg>
  );
}
