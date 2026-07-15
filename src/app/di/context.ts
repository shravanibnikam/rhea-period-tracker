import { createContext, useContext } from "react";
import { Container } from "./Container";

/** The app-wide container singleton (module scope = one per page). */
export const container = new Container();

const ContainerContext = createContext<Container>(container);

export const ContainerProvider = ContainerContext.Provider;

/** Resolve the composition root from React context (tests may override). */
export function useContainer(): Container {
  return useContext(ContainerContext);
}
