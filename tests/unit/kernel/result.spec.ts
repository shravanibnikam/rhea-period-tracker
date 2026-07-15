import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  flatMap,
  unwrapOr,
  tryCatch,
  fromPromise,
  all,
  type Result,
} from "@/kernel/result";

describe("Result", () => {
  it("ok/err construct discriminated variants", () => {
    const a = ok(1);
    const b = err("nope");
    expect(a.ok).toBe(true);
    expect(a.value).toBe(1);
    expect(b.ok).toBe(false);
    expect(b.error).toBe("nope");
    expect(isOk(a)).toBe(true);
    expect(isErr(b)).toBe(true);
  });

  it("map transforms values and passes errors through", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    const e: Result<number, string> = err("x");
    expect(map(e, (n) => n * 3)).toEqual(err("x"));
  });

  it("mapErr transforms errors and passes values through", () => {
    expect(mapErr(err("x"), (s) => s.toUpperCase())).toEqual(err("X"));
    expect(mapErr(ok(1), () => "unused")).toEqual(ok(1));
  });

  it("flatMap chains and short-circuits on the first error", () => {
    const half = (n: number): Result<number, string> =>
      n % 2 === 0 ? ok(n / 2) : err("odd");
    expect(flatMap(ok(4), half)).toEqual(ok(2));
    expect(flatMap(ok(3), half)).toEqual(err("odd"));
    expect(flatMap(err("early"), half)).toEqual(err("early"));
  });

  it("unwrapOr returns value or fallback", () => {
    expect(unwrapOr(ok(5), 0)).toBe(5);
    expect(unwrapOr(err("x"), 0)).toBe(0);
  });

  it("tryCatch captures throws", () => {
    expect(tryCatch(() => 1, String)).toEqual(ok(1));
    expect(
      tryCatch(() => {
        throw new Error("boom");
      }, (e) => (e as Error).message)
    ).toEqual(err("boom"));
  });

  it("fromPromise captures rejections", async () => {
    expect(await fromPromise(Promise.resolve(7), String)).toEqual(ok(7));
    expect(
      await fromPromise(Promise.reject(new Error("bad")), (e) => (e as Error).message)
    ).toEqual(err("bad"));
  });

  it("all collects or returns the first error", () => {
    expect(all([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(all<number, string>([ok(1), err("a"), err("b")])).toEqual(err("a"));
  });
});
