import { ulid as ulidLib, monotonicFactory } from 'ulid';

const mono = monotonicFactory();

/** Monotonic ULID — safe for batches generated in the same ms. */
export function newId(): string {
  return mono();
}

/** Non-monotonic ULID (use when timestamp uniqueness across calls isn't critical). */
export function ulid(): string {
  return ulidLib();
}
