/** Presentation-layer date formatting (Intl). Pure date MATH lives in domain/dates. */
export function fmt(
  date: Date,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  return date.toLocaleDateString("en-US", opts);
}
