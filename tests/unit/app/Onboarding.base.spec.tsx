// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Onboarding } from "@/app/views/tracker/Onboarding";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("onboarding on a project site", () => {
  it("loads the logo under the deployment base and keeps the logging actions usable", () => {
    vi.stubEnv("BASE_URL", "/rhea-period-tracker/");
    const onStartLogging = vi.fn();
    const onQuickAdd = vi.fn();
    const onImport = vi.fn();
    render(<Onboarding onStartLogging={onStartLogging} onQuickAdd={onQuickAdd} onImport={onImport} />);
    expect(screen.getByAltText("Rhea").getAttribute("src")).toBe("/rhea-period-tracker/rhea-mark.svg");
    fireEvent.click(screen.getByRole("button", { name: /Log today/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add your last period/ }));
    fireEvent.click(screen.getByRole("button", { name: /Import from another app/ }));
    expect(onStartLogging).toHaveBeenCalledOnce();
    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(onImport).toHaveBeenCalledOnce();
  });
});
