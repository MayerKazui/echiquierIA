import { useCallback, useState } from 'react';

/** Builds a `parse` function that only accepts one of the listed values. */
export function oneOf<T extends string | number>(values: readonly T[]) {
  return (raw: string): T | undefined => values.find((value) => String(value) === raw);
}

/**
 * useState backed by localStorage. `parse` turns the stored string back into a value
 * (return undefined to fall back to `initial`); storage errors are ignored.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  parse: (raw: string) => T | undefined
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (raw !== null) return parse(raw) ?? initial;
    } catch {
      // localStorage unavailable (private mode, blocked storage…)
    }
    return initial;
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Ignore quota / availability errors
      }
    },
    [key]
  );

  return [value, update];
}
