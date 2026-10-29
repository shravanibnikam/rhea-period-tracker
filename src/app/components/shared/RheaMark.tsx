import { cn } from "@/app/lib/cn";

/**
 * The Rhea mark, drawn inline in the brand colour so it follows the theme
 * (public/rhea-mark.svg is a fixed rose, kept for the favicon).
 * Decorative unless it has a label.
 */
export function RheaMark({ size, label, className }: { size: number; label?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("text-brand", className)}
    >
      <path d="M52.68 28.35A21 21 0 1 1 35.65 11.32" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <circle cx="46.85" cy="17.15" r="5" fill="currentColor" />
    </svg>
  );
}
