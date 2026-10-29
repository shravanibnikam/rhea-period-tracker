import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/app/lib/cn";

interface SheetProps {
  open: boolean;
  /** Radix calls this for Escape, the overlay and the close button — decide there (e.g. refuse while saving). */
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Pinned under the scrolling body: the sheet's actions. */
  footer?: ReactNode;
  children: ReactNode;
  /** Disable the corner close button (e.g. while a save is in flight). */
  closeDisabled?: boolean;
  className?: string;
}

/**
 * The one modal surface: a bottom sheet on phones, a centred dialog from `sm`.
 * Radix supplies the focus trap, scroll lock, Escape and `role="dialog"`
 * named by the title. On close, focus returns to whatever opened the sheet.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  closeDisabled = false,
  className,
}: SheetProps) {
  // Sheets open from state, not a Dialog.Trigger, so Radix has no trigger to
  // return focus to: keep what had focus as the sheet opened, and go back there.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-charcoal/45 dark:bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-card text-card-foreground shadow-soft outline-none",
            "inset-x-0 bottom-0 max-h-[92svh] rounded-t-3xl",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[85vh] sm:rounded-3xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-6 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-6",
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
            <div className="min-w-0">
              <Dialog.Title className="text-2xl text-foreground">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Close"
              disabled={closeDisabled}
              className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
          {footer ? (
            <div className="border-t border-border px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
