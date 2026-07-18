// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { ContainerProvider } from "@/app/di/context";
import { useLogger } from "@/app/hooks/useLogger";
import { emptyLog } from "@/domain/types";
import type { Container } from "@/app/di/Container";

afterEach(cleanup);

// A far-future date mirrors the smoke-test marker (2099-01-01).
const DATE = new Date(2099, 0, 1);
const KEY = "2099-01-01";

function wrapperFor(fake: Partial<Container>) {
  const container = fake as unknown as Container;
  return ({ children }: { children: ReactNode }) =>
    createElement(ContainerProvider, { value: container }, children);
}

describe("useLogger — exists / remove (Delete Log gap)", () => {
  it("exists is true after loading a persisted, non-deleted log", async () => {
    const getLog = vi.fn().mockResolvedValue(emptyLog(KEY));
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor({ getLog }) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(true);
  });

  it("exists is false when no log is persisted (empty draft is not 'existing')", async () => {
    const getLog = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor({ getLog }) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(false);
  });

  it("exists is false when the stored row is a soft-deleted tombstone", async () => {
    const getLog = vi.fn().mockResolvedValue({ ...emptyLog(KEY), deleted: true });
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor({ getLog }) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(false);
  });

  it("remove() calls deleteLog and clears exists", async () => {
    const getLog = vi.fn().mockResolvedValue(emptyLog(KEY));
    const deleteLog = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor({ getLog, deleteLog }) });
    await waitFor(() => expect(result.current.exists).toBe(true));
    await act(async () => { await result.current.remove(); });
    expect(deleteLog).toHaveBeenCalledWith(KEY);
    expect(result.current.exists).toBe(false);
  });

  it("a failed remove() rejects and leaves exists true (the log is retained)", async () => {
    const getLog = vi.fn().mockResolvedValue(emptyLog(KEY));
    const deleteLog = vi.fn().mockRejectedValue(new Error("tombstone write failed"));
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor({ getLog, deleteLog }) });
    await waitFor(() => expect(result.current.exists).toBe(true));
    await act(async () => {
      await expect(result.current.remove()).rejects.toThrow("tombstone write failed");
    });
    expect(result.current.exists).toBe(true);
  });

  it("save() marks a previously-absent log as existing", async () => {
    const getLog = vi.fn().mockResolvedValue(undefined);
    const saveLog = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor({ getLog, saveLog }) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(false);
    await act(async () => { await result.current.save(); });
    expect(saveLog).toHaveBeenCalled();
    expect(result.current.exists).toBe(true);
  });
});
