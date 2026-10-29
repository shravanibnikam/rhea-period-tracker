// @vitest-environment jsdom
/**
 * The sign-in screen: a busy submit keeps focus (aria-disabled plus a guard,
 * not disabled), "Check your email" is announced by taking focus, and there
 * is a way back to the landing page after a reload.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AuthScreen } from "@/app/views/auth/AuthScreen";

afterEach(cleanup);

function fill() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret12" } });
}

describe("AuthScreen", () => {
  it("a busy submit keeps focus and ignores another submit", async () => {
    let finish!: (err: string | null) => void;
    const onSignIn = vi.fn(() => new Promise<string | null>((r) => (finish = r)));
    render(<AuthScreen onSignIn={onSignIn} onSignUp={vi.fn()} />);
    fill();
    const submit = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    submit.focus();
    fireEvent.click(submit);

    const busy = await screen.findByRole("button", { name: "Signing in…" });
    expect(busy).toBe(submit);
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(submit);
    fireEvent.submit(submit.form!);
    expect(onSignIn).toHaveBeenCalledTimes(1);

    finish("That email and password don't match an account.");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(submit.hasAttribute("aria-disabled")).toBe(false);
  });

  it("'Check your email' takes focus, so it is announced", async () => {
    render(<AuthScreen onSignIn={vi.fn()} onSignUp={vi.fn().mockResolvedValue(null)} initialMode="signup" />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    const heading = await screen.findByRole("heading", { name: "Check your email" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("links back to the landing page", () => {
    render(<AuthScreen onSignIn={vi.fn()} onSignUp={vi.fn()} />);
    expect(screen.getByRole("link", { name: "What is Rhea?" }).getAttribute("href")).toBe("#welcome");
  });
});
