import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/app/lib/cn";

/**
 * A toggle chip (symptoms, moods). A real button with aria-pressed, so its
 * accessible name stays its label. Selected chips take the tint/ink of the
 * nearest `[data-phase]` scope. The chip is 36px tall; a pseudo-element grows
 * its hit area to 44px, filling a gap-2 row gap without overlapping the next row.
 */
export function Chip({
  selected,
  className,
  type = "button",
  ...props
}: { selected: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "relative inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors duration-150 before:absolute before:inset-x-0 before:-inset-y-1 active:scale-[0.98]",
        selected
          ? "bg-phase-tint text-phase-ink ring-1 ring-inset ring-phase/45"
          : "bg-muted text-foreground/80 hover:bg-secondary hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * Single choice from a short row (flow, energy, theme). Buttons with
 * aria-pressed, not radios, so each option is found by its label.
 * `allowDeselect`: tapping the chosen option clears it (onChange(null)).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  allowDeselect = false,
  className,
}: {
  label: string;
  value: T | null;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T | null) => void;
  allowDeselect?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-1 rounded-2xl bg-muted p-1", className)}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && allowDeselect ? null : o.value)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors duration-150",
              on ? "bg-card text-foreground shadow-soft ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 40×24 switch with a 48×44 hit area; give it an accessible name (aria-label or a <label htmlFor>). */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 bg-switch-background data-[state=checked]:bg-primary disabled:opacity-50 before:absolute before:-inset-x-1 before:-inset-y-2.5",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-card transition-transform duration-150 data-[state=checked]:translate-x-4 dark:bg-foreground dark:data-[state=checked]:bg-background" />
    </SwitchPrimitive.Root>
  );
}
