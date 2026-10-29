// @vitest-environment jsdom
/**
 * What Settings offers each role. Exports, imports and the cycle-length
 * override act on this device's store, and a partner's store is the owner's
 * cache, ungated by the share switches. So they show only for the account's
 * own logs: local mode or a resolved owner, never a partner or a role that
 * is still unknown (an offline partner's failed lookup leaves it null).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/app/lib/supabase", () => ({ supabase: null, isSupabaseConfigured: () => false }));

import { ContainerProvider } from "@/app/di/context";
import type { Container } from "@/app/di/Container";
import type { UserRole } from "@/app/hooks/useAuth";
import { SettingsView } from "@/app/views/settings/SettingsView";

afterEach(cleanup);

const container = { getMeta: vi.fn().mockResolvedValue(null) } as unknown as Container;

function renderSettings(userId: string | null, role: UserRole) {
  return render(
    <ContainerProvider value={container}>
      <SettingsView
        onDataChanged={vi.fn()}
        cycleLengthOverride={null}
        onCycleLengthOverrideChange={vi.fn()}
        onSourcesClick={vi.fn()}
        onPrivacyClick={vi.fn()}
        userId={userId}
        role={role}
        onSignOut={vi.fn()}
      />
    </ContainerProvider>
  );
}

describe("Settings by role", () => {
  const cases: [string, string | null, UserRole, boolean][] = [
    ["local mode", null, null, true],
    ["an owner", "u1", "owner", true],
    ["a partner", "u1", "partner", false],
    ["an unresolved role", "u1", null, false],
  ];
  for (const [who, userId, role, owns] of cases) {
    it(`${who} ${owns ? "gets" : "never gets"} exports, imports and the cycle length`, () => {
      renderSettings(userId, role);
      expect(screen.queryByRole("button", { name: "Export backup" }) !== null).toBe(owns);
      expect(screen.queryByRole("button", { name: "Import backup" }) !== null).toBe(owns);
      expect(screen.queryByRole("heading", { name: "Cycle" }) !== null).toBe(owns);
      expect(screen.queryByLabelText("Length in days") !== null).toBe(owns);
      // Erasing this device is always offered.
      expect(screen.getByRole("button", { name: "Erase" })).toBeTruthy();
    });
  }

  it("a partner's erase confirmation speaks of their copy of the partner's logs", () => {
    renderSettings("u1", "partner");
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    expect(screen.getByText(/deletes this device's copy of your partner's logs/)).toBeTruthy();
    expect(screen.queryByText(/all your logs/)).toBeNull();
    expect(screen.queryByText(/synced to your account/)).toBeNull();
  });

  it("an owner's erase confirmation is unchanged", () => {
    renderSettings("u1", "owner");
    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    expect(screen.getByText(/deletes all your logs, settings and cycle history on this device\. It does not sign you out/)).toBeTruthy();
  });
});

describe("Settings from onboarding's import action", () => {
  it("focuses the file button for another app, once", () => {
    const onImportFocused = vi.fn();
    render(
      <ContainerProvider value={container}>
        <SettingsView
          onDataChanged={vi.fn()}
          cycleLengthOverride={null}
          onCycleLengthOverrideChange={vi.fn()}
          onSourcesClick={vi.fn()}
          onPrivacyClick={vi.fn()}
          focusImport
          onImportFocused={onImportFocused}
        />
      </ContainerProvider>
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Choose file" }));
    expect(onImportFocused).toHaveBeenCalledOnce();
  });
});
