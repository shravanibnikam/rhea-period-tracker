// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Onboarding } from "@/app/views/tracker/Onboarding";

afterEach(() => { cleanup(); });

describe("onboarding on a project site", () => {
  it("draws the logo inline (no asset path for the base to break) and keeps the logging actions usable", () => {
    const onStartLogging = vi.fn();
    const onQuickAdd = vi.fn();
    const onImport = vi.fn();
    render(<Onboarding onStartLogging={onStartLogging} onQuickAdd={onQuickAdd} onImport={onImport} />);
    expect(screen.getByRole("img", { name: "Rhea" }).tagName.toLowerCase()).toBe("svg");
    fireEvent.click(screen.getByRole("button", { name: /Log today/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add your last period/ }));
    fireEvent.click(screen.getByRole("button", { name: /Import from another app/ }));
    expect(onStartLogging).toHaveBeenCalledOnce();
    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(onImport).toHaveBeenCalledOnce();
  });
});
