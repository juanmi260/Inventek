export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export type DomainError =
  | { kind: 'validation'; message: string; details?: unknown }
  | { kind: 'not-found'; entity: string; id?: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'insufficient-stock'; productId: string; warehouseId: string; available: number; requested: number }
  | { kind: 'storage-failure'; cause?: unknown }
  | { kind: 'unknown'; cause?: unknown };

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`Unwrap on Err: ${JSON.stringify(r.error)}`);
}
