import type { ReactNode } from "react";
import { ContainerProvider, container } from "./context";
import { Container } from "./Container";

/**
 * Root providers (M1.10). Today only the DI container; later providers
 * (toasts, sync status) compose here rather than in main.tsx.
 */
export function Providers({
  children,
  value = container,
}: {
  children: ReactNode;
  value?: Container;
}) {
  return <ContainerProvider value={value}>{children}</ContainerProvider>;
}
