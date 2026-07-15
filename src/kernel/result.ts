/**
 * Result<T, E> — expected, recoverable outcomes cross module boundaries as
 * values, not exceptions (spec Chapter 9 §4.1). Throwing is reserved for
 * programmer errors (see assert.ts).
 *
 * kernel/ is the zero-dependency leaf: this module imports nothing.
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

/** Transform the success value; errors pass through untouched. */
export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

/** Transform the error; success passes through untouched. */
export function mapErr<T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

/** Chain a fallible step; the first error short-circuits. */
export function flatMap<T, U, E>(
  r: Result<T, E>,
  f: (value: T) => Result<U, E>
): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

/** Extract the value, or a fallback when this is an error. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/**
 * Run a synchronous computation, capturing a thrown exception as `err`.
 * `onError` converts the unknown throw into the caller's error type.
 */
export function tryCatch<T, E>(f: () => T, onError: (e: unknown) => E): Result<T, E> {
  try {
    return ok(f());
  } catch (e) {
    return err(onError(e));
  }
}

/** Await a promise, capturing a rejection as `err`. */
export async function fromPromise<T, E>(
  p: Promise<T>,
  onError: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    return ok(await p);
  } catch (e) {
    return err(onError(e));
  }
}

/** Collect an array of results into a result of an array (first error wins). */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}
